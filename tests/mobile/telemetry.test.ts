import { test } from "node:test"
import assert from "node:assert/strict"
import { createAnalytics, type EventRow } from "../../mobile/src/telemetry/analytics"
import { scrubCrash } from "../../mobile/src/telemetry/privacy"

test("analytics is disabled without an enabled signed-in identity", async () => {
  let calls = 0
  for (const [enabled, user] of [[false, "user"], [true, null]] as const) {
    const analytics = createAnalytics({ enabled, identity: () => user, context: {}, send: async () => { calls++; return true } })
    assert.equal(await analytics.track("login"), false)
  }
  assert.equal(calls, 0)
})
test("analytics whitelists metadata, deduplicates, and separates users", async () => {
  let user = "one"; let time = 0
  const rows: EventRow[] = []
  const analytics = createAnalytics({ enabled: true, identity: () => user, now: () => time, context: { platform: "android" }, send: async row => { rows.push(row); return true } })
  assert.equal(await analytics.track("card_view", { email: "private@example.com", source: "browse", category: "token@example.com" }), true)
  assert.deepEqual(rows[0].metadata, { source: "browse", platform: "android" })
  await analytics.track("card_view", { source: "browse" })
  assert.equal(rows.length, 1)
  time = 2100; await analytics.track("card_view", { source: "browse" })
  user = "two"; await analytics.track("card_view", { source: "browse" })
  assert.deepEqual(rows.map(row => row.user_id), ["one", "one", "two"])
})
test("delivery failures stay nonfatal and pending delivery is bounded", async () => {
  const failing = createAnalytics({ enabled: true, identity: () => "one", context: {}, send: async () => { throw Error("offline") } })
  assert.equal(await failing.track("login"), false)
  const release: (() => void)[] = []
  const analytics = createAnalytics({ enabled: true, identity: () => "one", context: {}, send: () => new Promise(resolve => release.push(() => resolve(true))) })
  const pending = ["a", "b", "c", "d"].map(source => analytics.track("card_view", { source }))
  assert.equal(await analytics.track("card_view", { source: "e" }), false)
  release.forEach(done => done()); await Promise.all(pending)
})
test("crash redaction removes payloads and credentials while retaining stack locations", () => {
  const clean = scrubCrash({ user: { email: "private@example.com" }, request: { headers: { Authorization: "secret" } }, extra: { otp: "12345678" }, exception: { values: [{ value: "private 12345678", type: "Error", stacktrace: { frames: [{ filename: "https://example.com/app.js?token=secret", lineno: 12 }] } }] } })
  const text = JSON.stringify(clean)
  for (const secret of ["private", "12345678", "secret", "Authorization", "?token"]) assert.equal(text.includes(secret), false)
  assert.ok(text.includes('"lineno":12'))
  assert.ok(text.includes("https://example.com/app.js"))
})
