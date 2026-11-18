"""Failure-injection tests: no network requests, live scrapes, or real email."""

import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from pipeline import freshness, normalize, refresh
from scrapers._archive import save_scrape
from scripts import refresh_ops as ops


def row(slug):
    return {
        "company": freshness.SOURCES[slug], "address": f"123 {slug} Street, Champaign",
        "url": f"https://example.com/{slug}", "availability": "Available August 2027",
        "unit_type": "1 Bedroom", "beds": "1", "baths": "1", "price_per_bed": "900",
    }


def manifest(age_hours=0, run_id="test-run"):
    checked = (freshness.utc_now() - timedelta(hours=age_hours)).isoformat()
    return {
        "schema_version": 1, "run_id": run_id, "snapshot_date": "2026-10-03",
        "snapshot_sha256": "hash", "last_data_change_at": checked,
        "sources": {
            slug: {"company": company, "status": "success", "listing_count": 1,
                   "last_successful_check_at": checked}
            for slug, company in freshness.SOURCES.items()
        },
    }


def status(age_hours=0, run_id="test-run"):
    receipt = manifest(age_hours, run_id)
    return {"refresh": receipt, "last_scraped": receipt["snapshot_date"],
            "listing_count": len(freshness.SOURCES)}


class FreshnessTests(unittest.TestCase):
    def test_stale_source_controls_aggregate_even_when_other_sources_are_fresh(self):
        receipt = manifest()
        receipt["sources"]["smile"]["last_successful_check_at"] = (
            freshness.utc_now() - timedelta(hours=31)).isoformat()
        result = freshness.assess_manifest(receipt)
        self.assertEqual(result["state"], "stale")
        self.assertEqual(result["stale_sources"], ["smile"])

    def test_critical_after_two_days(self):
        self.assertEqual(freshness.assess_manifest(manifest(49))["state"], "critical")

    def test_missing_source_is_unknown(self):
        receipt = manifest()
        del receipt["sources"]["mhm"]
        self.assertEqual(freshness.assess_manifest(receipt)["state"], "unknown")

    def test_future_or_timezone_free_timestamps_cannot_claim_freshness(self):
        for value in ("2099-01-01T00:00:00+00:00", "2026-10-21T06:00:00"):
            with self.subTest(value=value):
                receipt = manifest()
                receipt["sources"]["bankier"]["last_successful_check_at"] = value
                self.assertEqual(freshness.assess_manifest(receipt)["state"], "unknown")

    def test_invalid_or_partial_metadata_is_unknown(self):
        for receipt in ({}, [], {"schema_version": 1, "run_id": "x", "sources": []}):
            self.assertEqual(freshness.assess_manifest(receipt)["state"], "unknown")
        receipt = manifest()
        receipt["sources"]["bankier"]["status"] = "incomplete"
        self.assertEqual(freshness.assess_manifest(receipt)["state"], "unknown")

    def test_mtime_change_does_not_make_legacy_data_fresh(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshots = Path(temp)
            (snapshots / "listings_2026-10-03.db").write_bytes(b"legacy")
            saved, result = freshness.read_refresh(snapshots, "2026-10-03")
            self.assertIsNone(saved)
            self.assertIsNone(result["last_successful_check_at"])
            self.assertEqual(result["state"], "unknown")

    def test_changed_database_invalidates_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshots = Path(temp)
            db = snapshots / "listings_2026-10-03.db"
            db.write_bytes(b"accepted")
            receipt = manifest()
            receipt["snapshot_sha256"] = freshness.file_hash(db)
            freshness.atomic_json(snapshots / "refresh-status.json", receipt)
            self.assertEqual(freshness.read_refresh(snapshots, "2026-10-03")[1]["state"], "fresh")
            db.write_bytes(b"different")
            self.assertEqual(freshness.read_refresh(snapshots, "2026-10-03")[1]["state"], "unknown")


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "data").mkdir()
        (self.root / "snapshots").mkdir()
        self.previous_date = (freshness.utc_now().date() - timedelta(days=3)).isoformat()
        self.db = self.root / "snapshots" / f"listings_{self.previous_date}.db"
        self.records = [row(slug) for slug in freshness.SOURCES]
        normalize.write_db([normalize.normalize(record) for record in self.records], self.db)
        (self.root / "snapshots/latest.txt").write_text(self.previous_date)
        receipt = manifest(age_hours=72, run_id="previous")
        receipt.update(snapshot_date=self.previous_date, snapshot_sha256=freshness.file_hash(self.db))
        freshness.atomic_json(self.root / "snapshots/refresh-status.json", receipt)
        for slug in freshness.SOURCES:
            freshness.atomic_json(self.root / "data" / f"{slug}_raw.json", [row(slug)])
        self.before = self.db.read_bytes()
        self.calls = {}

    def fake_command(self, command, stage, env, log, timeout):
        if "-m" in command:
            if command[-1] == "pipeline.normalize":
                with patch.object(normalize, "DATA_DIR", stage / "data"), patch.object(
                    normalize, "SNAPSHOTS_DIR", stage / "snapshots"
                ):
                    normalize.main()
            return  # Geocoding is unrelated to these failure-injection cases.
        slug = Path(command[1]).stem
        self.calls[slug] = self.calls.get(slug, 0) + 1
        with contextlib.chdir(stage), patch.dict(os.environ, {"REFRESH_RUN_ID": env["REFRESH_RUN_ID"]}):
            save_scrape([row(slug)], slug, failed=0)

    def run_refresh(self, command=None):
        with patch.object(refresh, "run_command", command or self.fake_command), patch.dict(
            os.environ, {"REFRESH_RUN_ID": "new-run"}
        ), contextlib.redirect_stdout(io.StringIO()):
            return refresh.refresh(self.root, retry_delay=0)

    def assert_previous_data_preserved(self):
        self.assertEqual(self.db.read_bytes(), self.before)
        self.assertEqual((self.root / "snapshots/latest.txt").read_text(), self.previous_date)
        self.assertEqual(json.loads((self.root / "snapshots/refresh-status.json").read_text())["run_id"], "previous")
        for slug in freshness.SOURCES:
            self.assertEqual(json.loads((self.root / "data" / f"{slug}_raw.json").read_text()), [row(slug)])

    def test_unchanged_listings_still_publish_a_new_successful_check(self):
        receipt = self.run_refresh()
        self.assertEqual(receipt["run_id"], "new-run")
        self.assertEqual(receipt["snapshot_date"], self.previous_date)
        self.assertEqual(receipt["snapshot_sha256"], freshness.file_hash(self.db))
        self.assertEqual(freshness.read_refresh(self.root / "snapshots", self.previous_date)[1]["state"], "fresh")
        self.assertEqual(len(receipt["sources"]), 9)

    def test_exhausted_network_failure_preserves_all_published_data(self):
        def broken(command, *args):
            if Path(command[1]).stem == "green_street":
                self.calls["green_street"] = self.calls.get("green_street", 0) + 1
                raise RuntimeError("Network timeout")
            return self.fake_command(command, *args)
        with self.assertRaisesRegex(RuntimeError, "Network timeout"):
            self.run_refresh(broken)
        self.assertEqual(self.calls["green_street"], 3)
        self.assert_previous_data_preserved()
        report = json.loads((self.root / "tmp/refresh/report.json").read_text())
        self.assertEqual(report["status"], "failed")

    def test_partial_scraper_with_zero_exit_is_rejected(self):
        def partial(command, stage, env, log, timeout):
            if Path(command[1]).stem == "bankier":
                with contextlib.chdir(stage), patch.dict(os.environ, {"REFRESH_RUN_ID": env["REFRESH_RUN_ID"]}):
                    save_scrape([row("bankier")], "bankier", failed=1)
                return
            self.fake_command(command, stage, env, log, timeout)
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            self.run_refresh(partial)
        self.assert_previous_data_preserved()

    def test_transient_failure_retries_and_publishes_only_after_success(self):
        attempts = []
        def transient(command, *args):
            if Path(command[1]).stem == "bankier":
                attempts.append(1)
                if len(attempts) == 1:
                    raise RuntimeError("Temporary connection reset")
            self.fake_command(command, *args)
        receipt = self.run_refresh(transient)
        self.assertEqual(receipt["sources"]["bankier"]["attempts"], 2)

    def test_changed_listings_publish_a_matching_new_snapshot(self):
        def changed(command, stage, env, log, timeout):
            if Path(command[1]).stem == "bankier":
                with contextlib.chdir(stage), patch.dict(os.environ, {"REFRESH_RUN_ID": env["REFRESH_RUN_ID"]}):
                    save_scrape([{**row("bankier"), "availability": "Leased"}], "bankier", failed=0)
                return
            self.fake_command(command, stage, env, log, timeout)
        receipt = self.run_refresh(changed)
        self.assertNotEqual(receipt["snapshot_date"], self.previous_date)
        self.assertEqual(freshness.read_refresh(self.root / "snapshots", receipt["snapshot_date"])[1]["state"], "fresh")
        self.assertEqual(json.loads((self.root / "data/bankier_raw.json").read_text())[0]["availability"], "Leased")

    def test_normalization_failure_does_not_publish_staged_scrapes(self):
        def failed_normalize(command, *args):
            if command[-1] == "pipeline.normalize":
                raise RuntimeError("Normalization failed")
            self.fake_command(command, *args)
        with self.assertRaisesRegex(RuntimeError, "Normalization failed"):
            self.run_refresh(failed_normalize)
        self.assert_previous_data_preserved()

    def test_empty_wrong_company_invalid_url_and_large_drop_are_blocked(self):
        invalid_url = {**row("bankier"), "url": "javascript:alert(1)"}
        for records in ([], [row("smile")], [invalid_url], [{**row("bankier"), "address": ""}]):
            with self.assertRaises(refresh.ValidationError):
                refresh.validate_source(records, freshness.SOURCES["bankier"], 1, 0.5)
        with self.assertRaisesRegex(refresh.ValidationError, "count fell"):
            refresh.validate_source([row("bankier")], freshness.SOURCES["bankier"], 10, 0.5)
        refresh.validate_source([row("bankier")], freshness.SOURCES["bankier"], 10, 0)

    def test_hung_scraper_is_terminated_and_reported(self):
        with self.assertRaisesRegex(RuntimeError, "exceeded"):
            refresh.run_command([sys.executable, "-c", "import time; time.sleep(60)"],
                                self.root, dict(os.environ), self.root / "timeout.log", 0.05)


class MemoryState:
    def __init__(self):
        self.state = {}

    def load(self):
        return copy.deepcopy(self.state)

    def save(self, state):
        self.state = copy.deepcopy(state)


class AlertTests(unittest.TestCase):
    def test_false_green_workflow_without_receipt_is_detected(self):
        self.assertEqual(ops.assess_production({"listing_count": 1287, "last_scraped": "2026-10-03"})["state"], "unknown")

    def test_malformed_production_sources_trigger_unknown_instead_of_crashing(self):
        for sources in (None, [], {"bankier": "invalid"}):
            malformed = status()
            malformed["refresh"]["sources"] = sources
            self.assertEqual(ops.assess_production(malformed)["state"], "unknown")

    def test_stale_alert_deduplicates_and_sends_one_recovery(self):
        store = MemoryState()
        with patch.object(ops, "production_status", return_value=status(31)), patch.object(ops, "send_email") as mail:
            self.assertEqual(ops.monitor("https://example.com/status", store), 1)
            self.assertEqual(ops.monitor("https://example.com/status", store), 1)
            self.assertEqual(mail.call_count, 1)
        with patch.object(ops, "production_status", return_value=status()), patch.object(ops, "send_email") as mail:
            self.assertEqual(ops.monitor("https://example.com/status", store), 0)
            self.assertEqual(ops.monitor("https://example.com/status", store), 0)
            self.assertEqual(mail.call_count, 1)
            self.assertIn("recovered", mail.call_args.args[0])

    def test_failed_email_does_not_mark_incident_as_notified(self):
        store = MemoryState()
        with patch.object(ops, "production_status", return_value=status(31)), patch.object(
            ops, "send_email", side_effect=RuntimeError("Mail unavailable")
        ), self.assertRaisesRegex(RuntimeError, "Mail unavailable"):
            ops.monitor("https://example.com/status", store)
        self.assertEqual(store.state, {})

    def test_critical_escalation_and_daily_reminder(self):
        store = MemoryState()
        store.state = {"incident": "stale", "notified_at": freshness.timestamp()}
        with patch.object(ops, "production_status", return_value=status(49)), patch.object(ops, "send_email") as mail:
            ops.monitor("https://example.com/status", store)
            self.assertEqual(mail.call_count, 1)
            self.assertIn("critical", mail.call_args.args[0])
        store.state["notified_at"] = (freshness.utc_now() - timedelta(hours=25)).isoformat()
        with patch.object(ops, "production_status", return_value=status(49)), patch.object(ops, "send_email") as mail:
            ops.monitor("https://example.com/status", store)
            self.assertEqual(mail.call_count, 1)

    def test_unavailable_status_alerts(self):
        with patch.object(ops, "production_status", side_effect=RuntimeError("Unavailable")), patch.object(ops, "send_email") as mail:
            self.assertEqual(ops.monitor("https://example.com/status", MemoryState()), 1)
            self.assertIn("unavailable", mail.call_args.args[0])

    def test_delivery_verification_rejects_old_run_and_accepts_new_run(self):
        with patch.object(ops, "production_status", return_value=status(run_id="old")):
            with self.assertRaisesRegex(RuntimeError, "delivery verification failed"):
                ops.verify("https://example.com/status", manifest(), timeout=0)
        with patch.object(ops, "production_status", return_value=status()):
            ops.verify("https://example.com/status", manifest(), timeout=0)

    def test_email_retries_use_same_idempotency_key_and_fixed_recipient(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "test-key", "REFRESH_ALERT_TO": "operator@example.com"}, clear=True), patch.object(
            ops, "request_json", side_effect=[OSError("Connection reset"), {"id": "email-test"}]
        ) as request, patch.object(ops.time, "sleep"):
            ops.send_email("Failure", "Summary", "test-incident")
        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[0].kwargs["headers"]["Idempotency-Key"], request.call_args_list[1].kwargs["headers"]["Idempotency-Key"])
        self.assertEqual(request.call_args.kwargs["payload"]["to"], ["operator@example.com"])

    def test_missing_email_configuration_fails_loudly(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(RuntimeError, "Email not configured"):
            ops.send_email("Failure", "Summary", "test-incident")


class BackendStatusTests(unittest.TestCase):
    def test_backend_uses_verified_checks_instead_of_file_mtime(self):
        from backend import main as backend
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as temp:
            snapshots = Path(temp)
            (snapshots / "latest.txt").write_text("2026-10-03")
            db = snapshots / "listings_2026-10-03.db"
            normalize.write_db([normalize.normalize(row(slug)) for slug in freshness.SOURCES], db)
            with patch.object(backend, "SNAPSHOTS_DIR", str(snapshots)), TestClient(backend.app) as client:
                legacy = client.get("/api/status").json()
                self.assertIsNone(legacy["last_scraped_at"])
                self.assertEqual(legacy["freshness"]["state"], "unknown")
                receipt = manifest()
                receipt["snapshot_sha256"] = freshness.file_hash(db)
                freshness.atomic_json(snapshots / "refresh-status.json", receipt)
                accepted = client.get("/api/status").json()
                self.assertEqual(accepted["freshness"]["state"], "fresh")
                self.assertEqual(accepted["listing_count"], 9)
                self.assertEqual(accepted["refresh"]["run_id"], "test-run")


if __name__ == "__main__":
    unittest.main()
