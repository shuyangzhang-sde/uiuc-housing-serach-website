"""Persisted source checks, independent of snapshot dates and deploy file mtimes."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

SOURCES = {
    "bankier": "Bankier Apartments",
    "green_street": "Green Street Realty",
    "jsj": "JSJ Property Management",
    "mhm": "MHM Properties",
    "octave": "Octave",
    "roland": "Roland Realty",
    "seven07": "Seven07",
    "smile": "Smile Student Living",
    "universities_group": "Universities Group",
}
WARNING_HOURS = 30
CRITICAL_HOURS = 48


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp() -> str:
    return utc_now().isoformat(timespec="seconds")


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Check timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + ".tmp")
    pending.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    pending.replace(path)


def assess_manifest(manifest: dict, now: datetime | None = None) -> dict:
    """Fail closed on missing sources, invalid timestamps, or incomplete checks."""
    now = now or utc_now()
    try:
        if manifest.get("schema_version") != 1 or not manifest.get("run_id"):
            raise ValueError("Missing refresh version")
        sources = manifest["sources"]
        if set(sources) != set(SOURCES):
            raise ValueError("Missing expected source checks")
        times = []
        stale = []
        for slug, company in SOURCES.items():
            source = sources[slug]
            if source["status"] != "success" or source["company"] != company:
                raise ValueError(f"Incomplete check: {slug}")
            if not isinstance(source["listing_count"], int) or source["listing_count"] <= 0:
                raise ValueError(f"Invalid count: {slug}")
            checked = parse_timestamp(source["last_successful_check_at"])
            if checked > now + timedelta(minutes=5):
                raise ValueError(f"Future check timestamp: {slug}")
            times.append(checked)
            if now - checked > timedelta(hours=WARNING_HOURS):
                stale.append(slug)
        oldest = min(times)
        age = max(0, (now - oldest).total_seconds() / 3600)
        state = "critical" if age > CRITICAL_HOURS else "stale" if stale else "fresh"
        return {
            "state": state,
            "last_successful_check_at": oldest.isoformat(timespec="seconds"),
            "age_hours": round(age, 2),
            "stale_sources": stale,
            "warning_after_hours": WARNING_HOURS,
            "critical_after_hours": CRITICAL_HOURS,
        }
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        return {
            "state": "unknown", "last_successful_check_at": None,
            "age_hours": None, "stale_sources": list(SOURCES),
            "warning_after_hours": WARNING_HOURS,
            "critical_after_hours": CRITICAL_HOURS, "reason": str(exc),
        }


def read_refresh(snapshots: Path, snapshot_date: str | None) -> tuple[dict | None, dict]:
    try:
        manifest = json.loads((snapshots / "refresh-status.json").read_text())
        if not snapshot_date or manifest.get("snapshot_date") != snapshot_date:
            raise ValueError("Refresh metadata does not match the active snapshot")
        db_path = snapshots / f"listings_{snapshot_date}.db"
        if manifest.get("snapshot_sha256") != file_hash(db_path):
            raise ValueError("Refresh metadata does not match the served database")
        return manifest, assess_manifest(manifest)
    except (OSError, ValueError, TypeError, AttributeError):
        return None, assess_manifest({})
