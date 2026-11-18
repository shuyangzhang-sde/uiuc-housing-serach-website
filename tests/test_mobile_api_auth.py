"""Mobile bearer requests exercise the existing backend's real JWT verification."""
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from backend import main


class MobileApiAuthTests(unittest.TestCase):
    def setUp(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.dev_mode = patch.object(main, "_DEV_MODE", False)
        self.jwks = patch.object(main._jwks_client, "get_signing_key_from_jwt", return_value=SimpleNamespace(key=self.key.public_key()))
        self.dev_mode.start()
        self.jwks.start()
        self.addCleanup(self.dev_mode.stop)
        self.addCleanup(self.jwks.stop)
        self.client = TestClient(main.app)

    def token(self, **claims):
        return jwt.encode({"sub": "test-mobile-user", "aud": "authenticated", "exp": int(time.time()) + 60, **claims}, self.key, algorithm="ES256")

    def test_bearer_access_without_web_cookies(self):
        response = self.client.get("/api/listings?page=1&page_size=5", headers={"Authorization": f"Bearer {self.token()}"})
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.json()["listings"]), 5)
        self.assertIsInstance(response.json()["listings"], list)

    def test_missing_expired_or_wrong_audience_is_rejected(self):
        self.assertEqual(self.client.get("/api/listings").status_code, 401)
        for token in [self.token(exp=1), self.token(aud="other-client")]:
            with self.subTest(token_kind="invalid claims"):
                self.assertEqual(self.client.get("/api/listings", headers={"Authorization": f"Bearer {token}"}).status_code, 401)

    def test_status_is_public(self):
        self.assertEqual(self.client.get("/api/status").status_code, 200)


if __name__ == "__main__":
    unittest.main()
