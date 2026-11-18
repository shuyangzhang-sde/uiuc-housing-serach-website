"""No live writes: exercise real JWT checks and mock only the Supabase boundary."""
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from backend import main, telemetry


class MobileEventsTests(unittest.TestCase):
    def setUp(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.client = TestClient(main.app)
        self.user = "00000000-0000-4000-8000-000000000001"
        for mock in [
            patch.object(main, "_DEV_MODE", False),
            patch.object(main._jwks_client, "get_signing_key_from_jwt", return_value=SimpleNamespace(key=self.key.public_key())),
            patch.dict(os.environ, ANALYTICS_ENABLED="true", ADMIN_EMAIL="admin@example.com", SUPABASE_PUBLISHABLE_KEY="public-test-key"),
        ]:
            mock.start(); self.addCleanup(mock.stop)
        telemetry._recent.clear()
        self.forward = patch.object(telemetry.httpx, "post", return_value=httpx.Response(201)).start()
        self.addCleanup(patch.stopall)
        self.payload = {"event_type": "map_view", "metadata": {"platform": "android", "environment": "preview", "app_version": "0.1.0"}}

    def headers(self, **claims):
        token = jwt.encode({"sub": self.user, "email": "tester@example.com", "aud": "authenticated", "exp": int(time.time()) + 60, **claims}, self.key, algorithm="ES256")
        return {"Authorization": f"Bearer {token}"}

    def test_authenticated_identity_forwarded_under_caller_rls(self):
        headers = self.headers()
        response = self.client.post("/api/events", json=self.payload, headers=headers)
        self.assertEqual(response.status_code, 200)
        args = self.forward.call_args.kwargs
        self.assertEqual(args["json"]["user_id"], self.user)
        self.assertEqual(args["headers"]["Authorization"], headers["Authorization"])
        self.assertEqual(args["headers"]["apikey"], "public-test-key")

    def test_home_visit_is_accepted_with_verified_identity(self):
        payload = {**self.payload, "event_type": "home_view"}
        response = self.client.post("/api/events", json=payload, headers=self.headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.forward.call_args.kwargs["json"]["event_type"], "home_view")
        self.assertEqual(self.forward.call_args.kwargs["json"]["user_id"], self.user)

    def test_missing_expired_and_dev_bypass_cannot_write(self):
        for headers in [{}, self.headers(exp=1)]:
            self.assertEqual(self.client.post("/api/events", json=self.payload, headers=headers).status_code, 401)
        with patch.object(main, "_DEV_MODE", True):
            self.assertEqual(self.client.post("/api/events", json=self.payload, headers=self.headers()).status_code, 401)
        self.forward.assert_not_called()

    def test_spoofed_identity_unknown_events_and_sensitive_metadata_rejected(self):
        for payload in [
            {**self.payload, "user_id": self.user},
            {**self.payload, "event_type": "arbitrary"},
            {**self.payload, "metadata": {"email": "tester@example.com"}},
            {**self.payload, "metadata": {**self.payload["metadata"], "source": "https://secret.example/?code=12345678"}},
        ]:
            self.assertEqual(self.client.post("/api/events", json=payload, headers=self.headers()).status_code, 422)
        self.forward.assert_not_called()

    def test_admin_excluded_and_disabled_configuration_never_writes(self):
        response = self.client.post("/api/events", json=self.payload, headers=self.headers(email="ADMIN@example.com"))
        self.assertEqual(response.json(), {"ok": True, "skipped": "admin"})
        with patch.dict(os.environ, ANALYTICS_ENABLED="false"):
            self.assertEqual(self.client.post("/api/events", json=self.payload, headers=self.headers()).status_code, 503)
        self.forward.assert_not_called()

    def test_delivery_errors_are_redacted_and_rate_is_bounded(self):
        self.forward.side_effect = httpx.ConnectError("secret backend detail")
        response = self.client.post("/api/events", json=self.payload, headers=self.headers())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret", response.text)
        telemetry._recent[self.user] = (time.monotonic(), 60)
        self.assertEqual(self.client.post("/api/events", json=self.payload, headers=self.headers()).status_code, 429)


if __name__ == "__main__":
    unittest.main()
