"""Run all scrapers in staging; publish only a complete, validated candidate.

    python -m pipeline.refresh
"""

import argparse
from contextlib import closing
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

from pipeline.freshness import SOURCES, atomic_json, file_hash, timestamp

ROOT = Path(__file__).resolve().parents[1]


class ValidationError(ValueError):
    pass


def validate_source(records, company: str, previous_count: int, min_ratio: float) -> None:
    if not isinstance(records, list) or not records:
        raise ValidationError(f"{company}: expected a nonempty listing array")
    if previous_count and len(records) < previous_count * min_ratio:
        raise ValidationError(
            f"{company}: count fell from {previous_count} to {len(records)}; "
            "review the source before allowing a large drop"
        )
    for index, row in enumerate(records):
        if not isinstance(row, dict) or row.get("company") != company:
            raise ValidationError(f"{company}: wrong company in row {index}")
        # Some legitimate source listings do not name a floor plan/unit type.
        for field in ("address", "url", "availability"):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValidationError(f"{company}: missing {field} in row {index}")
        url = urlparse(row["url"])
        if url.scheme not in ("http", "https") or not url.hostname:
            raise ValidationError(f"{company}: invalid listing URL in row {index}")


def run_command(command: list[str], stage: Path, env: dict, log: Path, timeout: int) -> None:
    print(f"Running: {' '.join(command)}", flush=True)
    with log.open("a") as stream:
        stream.write(f"\nCOMMAND: {' '.join(command)}\n")
        stream.flush()
        process = subprocess.Popen(command, cwd=stage, env=env, stdout=stream,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            returncode = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            # Kill the process group, including Playwright's browser/driver.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise RuntimeError(f"{command[-1]} exceeded {timeout}s; see {log.name}") from None
    if returncode:
        raise RuntimeError(f"Command failed with exit {returncode}; see {log.name}")


def validate_snapshot(path: Path, expected: dict) -> None:
    with closing(sqlite3.connect(path)) as conn:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValidationError("Snapshot integrity check failed")
        actual = dict(conn.execute("SELECT company, COUNT(*) FROM listings GROUP BY company"))
    if actual != expected:
        raise ValidationError(f"Snapshot source counts differ from validated raw data: {actual}")


def publish(stage: Path, root: Path) -> None:
    """CI commits these files together; production receives one coherent version."""
    for folder, pattern in (("data", "*_raw.json"), ("snapshots", "*")):
        target = root / folder
        target.mkdir(exist_ok=True)
        for source in sorted((stage / folder).glob(pattern)):
            if source.is_file() and source.name != "refresh-status.json":
                pending = target / (source.name + ".pending")
                shutil.copyfile(source, pending)
                pending.replace(target / source.name)
    # Publish the receipt only after all the corresponding data files are present.
    atomic_json(root / "snapshots/refresh-status.json",
                json.loads((stage / "snapshots/refresh-status.json").read_text()))


def refresh(root: Path, attempts: int = 3, retry_delay: int = 30,
            min_ratio: float = 0.5, source_timeout: int = 1800) -> dict:
    run_id = os.environ.get("REFRESH_RUN_ID") or str(uuid.uuid4())
    diagnostics = root / "tmp/refresh"
    diagnostics.mkdir(parents=True, exist_ok=True)
    report_path = diagnostics / "report.json"
    report = {"run_id": run_id, "started_at": timestamp(), "status": "running", "sources": {}}
    atomic_json(report_path, report)
    try:
        with tempfile.TemporaryDirectory(prefix="housing-refresh-") as temporary:
            stage = Path(temporary)
            (stage / "data").mkdir()
            (stage / "snapshots").mkdir()
            previous_path = root / "snapshots/latest.txt"
            if previous_path.exists():
                previous_date = previous_path.read_text().strip()
                shutil.copyfile(previous_path, stage / "snapshots/latest.txt")
                previous_db = root / "snapshots" / f"listings_{previous_date}.db"
                shutil.copyfile(previous_db, stage / "snapshots" / previous_db.name)
            env = {**os.environ, "PYTHONPATH": str(ROOT), "PYTHONUNBUFFERED": "1",
                   "REFRESH_RUN_ID": run_id}
            sources = {}
            for slug, company in SOURCES.items():
                raw_name = f"{slug}_raw.json"
                baseline = root / "data" / raw_name
                previous_count = len(json.loads(baseline.read_text())) if baseline.exists() else 0
                # Green Street always refreshes volatile fields from its list page.
                # Reuse static enrichment so the daily run respects its 10s crawl
                # delay without re-fetching hundreds of unchanged detail pages.
                if slug == "green_street" and baseline.exists():
                    shutil.copyfile(baseline, stage / "data" / raw_name)
                error = None
                for attempt in range(1, attempts + 1):
                    report["sources"][slug] = {"status": "running", "attempt": attempt}
                    atomic_json(report_path, report)
                    try:
                        receipt_path = stage / "data" / f"{slug}_scrape_status.json"
                        receipt_path.unlink(missing_ok=True)
                        command = [sys.executable, str(ROOT / "scrapers" / f"{slug}.py")]
                        run_command(command, stage, env, diagnostics / f"{slug}.log", source_timeout)
                        receipt = json.loads(receipt_path.read_text())
                        if (receipt.get("run_id") != run_id or receipt.get("complete") is not True
                                or receipt.get("failed_properties") != 0):
                            raise ValidationError(f"{company}: incomplete or missing current-run receipt")
                        records = json.loads((stage / "data" / raw_name).read_text())
                        validate_source(records, company, previous_count, min_ratio)
                        if receipt.get("listing_count") != len(records):
                            raise ValidationError(f"{company}: receipt count mismatch")
                        sources[slug] = {
                            "company": company, "status": "success", "listing_count": len(records),
                            "last_attempt_at": receipt["checked_at"],
                            "last_successful_check_at": receipt["checked_at"], "attempts": attempt,
                        }
                        report["sources"][slug] = sources[slug]
                        error = None
                        break
                    except (OSError, ValueError, RuntimeError) as exc:
                        error = str(exc)
                        report["sources"][slug] = {"status": "failed", "attempt": attempt, "error": error}
                        atomic_json(report_path, report)
                        if isinstance(exc, ValidationError) and "count fell" in error:
                            break  # A suspicious content change needs review, not more requests.
                        if attempt < attempts:
                            time.sleep(retry_delay * 2 ** (attempt - 1))
                if error:
                    raise RuntimeError(f"{slug}: {error}")
                atomic_json(report_path, report)

            for module in ("pipeline.normalize", "pipeline.geocode"):
                run_command([sys.executable, "-m", module], stage, env,
                            diagnostics / "pipeline.log", 900)
            snapshot_date = (stage / "snapshots/latest.txt").read_text().strip()
            db = stage / "snapshots" / f"listings_{snapshot_date}.db"
            validate_snapshot(db, {s["company"]: s["listing_count"] for s in sources.values()})
            digest = file_hash(db)
            old_status_path = root / "snapshots/refresh-status.json"
            old = json.loads(old_status_path.read_text()) if old_status_path.exists() else {}
            completed_at = timestamp()
            manifest = {
                "schema_version": 1, "run_id": run_id, "completed_at": completed_at,
                "snapshot_date": snapshot_date, "snapshot_sha256": digest,
                "last_data_change_at": old.get("last_data_change_at")
                    if old.get("snapshot_sha256") == digest else completed_at,
                "schedule": {"cron": "0 6 * * *", "timezone": "America/Chicago"},
                "sources": sources,
            }
            atomic_json(stage / "snapshots/refresh-status.json", manifest)
            publish(stage, root)
            report.update(status="success", completed_at=completed_at, snapshot_date=snapshot_date)
            atomic_json(report_path, report)
            print(f"Validated refresh {run_id}: {sum(s['listing_count'] for s in sources.values())} listings")
            return manifest
    except Exception as exc:
        report.update(status="failed", error=str(exc), finished_at=timestamp())
        atomic_json(report_path, report)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--retry-delay", type=int, default=30)
    parser.add_argument("--allow-large-drop", action="store_true",
                        help="Only after reviewing a legitimate source count reduction")
    args = parser.parse_args()
    if args.attempts < 1 or args.retry_delay < 0:
        parser.error("attempts must be positive and retry delay nonnegative")
    refresh(ROOT, args.attempts, args.retry_delay, min_ratio=0 if args.allow_large_drop else 0.5)


if __name__ == "__main__":
    main()
