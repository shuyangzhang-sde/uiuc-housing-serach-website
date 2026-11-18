"""Verify production delivery, send operational mail, and monitor stale checks.

The monitor can run outside GitHub with a persistent --state-file. In Actions,
--github-state stores notification state on a separate operations branch.
All network calls have bounded timeouts; email secrets are read only from env.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.freshness import (  # noqa: E402
    assess_manifest, atomic_json, parse_timestamp, timestamp, utc_now,
)

DEFAULT_URL = "https://illinirent.com/api/status"
STATE_BRANCH = "ops/refresh-monitor-state"


def request_json(url: str, *, payload=None, headers=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Accept": "application/json",
                                              "Content-Type": "application/json",
                                              "User-Agent": "IlliniRent-refresh-monitor/1.0",
                                              **(headers or {})})
    with urllib.request.urlopen(request, timeout=20) as response:
        if "application/json" not in response.headers.get("Content-Type", ""):
            raise ValueError("Expected JSON; received a redirect/login page or invalid response")
        return json.load(response)


def production_status(url: str) -> dict:
    error = None
    for attempt in range(3):
        try:
            result = request_json(url, headers={"Cache-Control": "no-cache"})
            if not isinstance(result, dict):
                raise ValueError("Status endpoint did not return an object")
            if not isinstance(result.get("listing_count"), int) or result["listing_count"] <= 0:
                raise ValueError("Production has no usable listings")
            return result
        except (OSError, ValueError) as exc:
            error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Production status unavailable: {error}")


def assess_production(status: dict) -> dict:
    manifest = status.get("refresh")
    if not isinstance(manifest, dict) or manifest.get("snapshot_date") != status.get("last_scraped"):
        return assess_manifest({})
    assessment = assess_manifest(manifest)
    if assessment["state"] == "unknown":
        return assessment
    expected_count = sum(s.get("listing_count", 0) for s in manifest.get("sources", {}).values()
                         if isinstance(s, dict) and isinstance(s.get("listing_count"), int))
    if status.get("listing_count") != expected_count:
        return assess_manifest({})
    return assessment


def send_email(subject: str, body: str, dedup_key: str) -> None:
    key = os.environ.get("RESEND_API_KEY")
    recipients = [value.strip() for value in os.environ.get("REFRESH_ALERT_TO", "").split(",") if value.strip()]
    if not key or not recipients:
        raise RuntimeError("Email not configured: set RESEND_API_KEY and REFRESH_ALERT_TO in Actions secrets")
    payload = {
        "from": os.environ.get("RESEND_FROM_ADDRESS") or "IlliniRent <hello@illinirent.com>",
        "to": recipients, "subject": subject, "text": body,
    }
    headers = {"Authorization": f"Bearer {key}",
               "Idempotency-Key": hashlib.sha256(dedup_key.encode()).hexdigest()}
    for attempt in range(3):
        try:
            response = request_json("https://api.resend.com/emails", payload=payload, headers=headers)
            if not response.get("id"):
                raise RuntimeError("Email provider did not confirm acceptance")
            print("Operational email accepted by Resend.")
            return
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500:
                raise RuntimeError(f"Email provider rejected the request (HTTP {exc.code})") from None
            if attempt == 2:
                raise RuntimeError(f"Email provider unavailable (HTTP {exc.code})") from None
        except OSError:
            if attempt == 2:
                raise RuntimeError("Email provider could not be reached") from None
        time.sleep(2 ** attempt)


def run_url() -> str:
    repository = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    return f"https://github.com/{repository}/actions/runs/{run_id}" if repository and run_id else "Local run"


def verify(url: str, manifest: dict, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    error = "Production has not served this refresh yet"
    while True:
        try:
            status = production_status(url)
            served = status.get("refresh") or {}
            if (served.get("run_id") == manifest["run_id"]
                    and served.get("snapshot_sha256") == manifest["snapshot_sha256"]
                    and assess_production(status)["state"] == "fresh"):
                print(f"Production serves verified refresh {manifest['run_id']}")
                return
            error = f"Expected run {manifest['run_id']}; production reports {served.get('run_id', 'unknown')}"
        except (RuntimeError, ValueError) as exc:
            error = str(exc)
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Production delivery verification failed: {error}")
        time.sleep(min(15, max(0, deadline - time.monotonic())))


class MonitorState:
    """Local persistence for external schedulers, or GitHub's contents API."""

    def __init__(self, path: Path, github: bool = False):
        self.path = path
        self.github = github
        self.sha = None
        self.api = f"https://api.github.com/repos/{os.environ.get('GITHUB_REPOSITORY', '')}"
        self.headers = {"Authorization": f"Bearer {os.environ.get('GH_TOKEN', '')}"}
        if github and (not os.environ.get("GITHUB_REPOSITORY") or not os.environ.get("GH_TOKEN")):
            raise RuntimeError("GitHub state requires GITHUB_REPOSITORY and GH_TOKEN")

    def load(self) -> dict:
        if not self.github:
            return json.loads(self.path.read_text()) if self.path.exists() else {}
        try:
            response = request_json(f"{self.api}/contents/monitor-state.json?ref={STATE_BRANCH}",
                                    headers=self.headers)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return {}
            raise
        self.sha = response["sha"]
        return json.loads(base64.b64decode(response["content"]))

    def save(self, state: dict) -> None:
        if not self.github:
            atomic_json(self.path, state)
            return
        if not self.sha:
            try:
                request_json(f"{self.api}/git/ref/heads/{STATE_BRANCH}", headers=self.headers)
            except urllib.error.HTTPError as exc:
                if exc.code != 404:
                    raise
                base = os.environ.get("GITHUB_SHA")
                if not base:
                    raise RuntimeError("GITHUB_SHA is required to initialize monitor state")
                request_json(f"{self.api}/git/refs", headers=self.headers,
                             payload={"ref": f"refs/heads/{STATE_BRANCH}", "sha": base})
        payload = {
            "message": "chore: record refresh monitor state [skip ci]",
            "branch": STATE_BRANCH,
            "content": base64.b64encode((json.dumps(state, indent=2) + "\n").encode()).decode(),
        }
        if self.sha:
            payload["sha"] = self.sha
        response = request_json(f"{self.api}/contents/monitor-state.json", payload=payload,
                                headers=self.headers, method="PUT")
        self.sha = response["content"]["sha"]


def monitor(url: str, store: MonitorState) -> int:
    state = store.load()
    try:
        status = production_status(url)
        assessment = assess_production(status)
        incident = assessment["state"]
        detail = json.dumps(assessment, indent=2)
    except RuntimeError as exc:
        incident, detail = "unavailable", str(exc)
    now = utc_now()
    if incident == "fresh":
        if state.get("incident") and state.get("incident") != "fresh":
            send_email("[IlliniRent] Housing refresh recovered",
                       f"Production checks are fresh again.\n{detail}\n{url}\n{run_url()}",
                       f"recovered:{state.get('notified_at')}")
            store.save({"incident": "fresh", "recovered_at": timestamp()})
        print("All source checks are fresh.")
        return 0
    notified_at = state.get("notified_at")
    due = (state.get("incident") != incident or not notified_at
           or now - parse_timestamp(notified_at) >= timedelta(hours=24))
    if due:
        send_email(f"[IlliniRent] Refresh monitor: {incident}",
                   f"Housing data requires attention.\n{detail}\nStatus: {url}\nMonitor: {run_url()}",
                   f"monitor:{incident}:{notified_at or 'initial'}:{now.date()}")
        store.save({"incident": incident, "notified_at": timestamp()})
    else:
        print(f"Continuing {incident} incident; reminder suppressed until 24 hours have elapsed.")
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    verifier = commands.add_parser("verify")
    verifier.add_argument("--url", default=os.environ.get("REFRESH_STATUS_URL") or DEFAULT_URL)
    verifier.add_argument("--manifest", type=Path, default=Path("snapshots/refresh-status.json"))
    verifier.add_argument("--timeout", type=int, default=900)
    failure = commands.add_parser("failure")
    failure.add_argument("--report", type=Path, default=Path("tmp/refresh/report.json"))
    watcher = commands.add_parser("monitor")
    watcher.add_argument("--url", default=os.environ.get("REFRESH_STATUS_URL") or DEFAULT_URL)
    watcher.add_argument("--state-file", type=Path, default=Path("tmp/refresh-monitor-state.json"))
    watcher.add_argument("--github-state", action="store_true")
    commands.add_parser("heartbeat")
    args = parser.parse_args()
    if args.command == "verify":
        try:
            verify(args.url, json.loads(args.manifest.read_text()), args.timeout)
        except Exception as exc:
            report_path = Path("tmp/refresh/report.json")
            report = json.loads(report_path.read_text()) if report_path.exists() else {}
            report.update(status="failed", failure_stage="production_verification", error=str(exc))
            atomic_json(report_path, report)
            raise
    elif args.command == "failure":
        report = json.loads(args.report.read_text()) if args.report.exists() else {"error": "Failed before a refresh report was available"}
        previous = Path("snapshots/refresh-status.json")
        receipt = json.loads(previous.read_text()) if previous.exists() else {}
        previous_check = assess_manifest(receipt)["last_successful_check_at"]
        body = (f"Refresh or production verification failed.\nRun: {run_url()}\n"
                f"Last accepted source check: {previous_check or 'unknown'}\n"
                f"Refresh report:\n{json.dumps(report, indent=2)}\n"
                "If the report says success, inspect deployment verification or Git push logs.")
        send_email("[IlliniRent] Housing refresh failed", body,
                   f"failure:{run_url()}:{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}")
    elif args.command == "monitor":
        raise SystemExit(monitor(args.url, MonitorState(args.state_file, args.github_state)))
    else:
        url = os.environ.get("REFRESH_HEARTBEAT_URL")
        if not url:
            print("::warning::External dead-man monitoring is not configured: set REFRESH_HEARTBEAT_URL.")
            return
        # Call only after successful production verification. Never log this secret URL.
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "IlliniRent-refresh/1.0"}), timeout=20) as response:
            if response.status != 200:
                raise RuntimeError("External heartbeat did not accept the check-in")
        print("External success heartbeat delivered.")


if __name__ == "__main__":
    main()
