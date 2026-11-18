"""Validated mobile events forwarded with the caller's JWT under existing RLS."""
import os
import re
import time
from collections import OrderedDict
from threading import Lock
from typing import Literal
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator


class MobileEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_type: Literal["login", "home_view", "card_view", "map_view", "map_search", "listing_view", "filter_change", "sort_change", "source_open", "beta_diagnostic"]
    metadata: dict[str, str] = Field(max_length=8)

    @field_validator("metadata")
    @classmethod
    def safe_metadata(cls, value):
        allowed = {"screen", "source", "category", "sort", "platform", "app_version", "app_build", "environment"}
        if any(key not in allowed or not re.fullmatch(r"[a-zA-Z0-9_. -]{1,64}", item) for key, item in value.items()):
            raise ValueError("Unsupported metadata")
        if value.get("platform") not in {"android", "ios"} or value.get("environment") not in {"preview", "production"}:
            raise ValueError("Unsupported app platform or environment")
        return value


_recent = OrderedDict()
_lock = Lock()


def record_event(event: MobileEvent, claims: dict | None, token: str | None, supabase_url: str):
    # DEV_MODE bypass is only for reads; never allow it to authorize analytics writes.
    if not claims or not token:
        raise HTTPException(401, "Verified identity required")
    try:
        user_id = str(UUID(claims["sub"]))
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Verified identity required")
    admins = {email.strip().lower() for email in os.getenv("ADMIN_EMAIL", "").split(",") if email.strip()}
    if str(claims.get("email", "")).strip().lower() in admins:
        return {"ok": True, "skipped": "admin"}
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if os.getenv("ANALYTICS_ENABLED", "false").lower() != "true" or not key or not admins:
        raise HTTPException(503, "Analytics unavailable")
    # Bounded per-process guard; RLS remains the authority for write identity.
    with _lock:
        now = time.monotonic()
        started, count = _recent.pop(user_id, (now, 0))
        if now - started >= 60:
            started, count = now, 0
        _recent[user_id] = (started, count + 1)
        while len(_recent) > 1024:
            _recent.popitem(last=False)
        if count >= 60:
            raise HTTPException(429, "Event limit reached")
    try:
        response = httpx.post(
            f"{supabase_url.rstrip('/')}/rest/v1/events",
            headers={"apikey": key, "Authorization": f"Bearer {token}", "Prefer": "return=minimal"},
            json={"user_id": user_id, "event_type": event.event_type, "metadata": event.metadata},
            timeout=5,
        )
        if not response.is_success:
            raise HTTPException(503, "Analytics unavailable")
    except httpx.HTTPError:
        raise HTTPException(503, "Analytics unavailable")
    return {"ok": True}
