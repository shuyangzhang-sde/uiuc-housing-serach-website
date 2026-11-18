import assert from "node:assert/strict"
import { test } from "node:test"
import { ApiError } from "@illirent/api-client"
import { listingErrorMessage } from "../../mobile/src/listings/errors"

test("backend connectivity errors preserve the distinction from successful email sign-in", () => {
  for (const kind of ["network", "timeout", "invalid-response"] as const) {
    const message = listingErrorMessage(new ApiError("failure", kind))
    assert.match(message, /signed in/)
    assert.doesNotMatch(message, /passcode|expired/)
  }
})
test("expired auth, busy service, and server failure have distinct recovery messages", () => {
  assert.match(listingErrorMessage(new ApiError("unauthorized", "http", 401)), /sign in again/)
  assert.match(listingErrorMessage(new ApiError("busy", "http", 429)), /wait a moment/)
  assert.match(listingErrorMessage(new ApiError("unavailable", "http", 503)), /temporarily unavailable/)
})
