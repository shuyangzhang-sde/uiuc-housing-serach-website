import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import type { Session, SupabaseClient, AuthChangeEvent } from "@supabase/supabase-js"
import { createSecureStorage } from "../../mobile/src/auth/secureStorage"
import { createSessionStore } from "../../mobile/src/auth/sessionStore"
import { createAuthenticatedApi } from "../../mobile/src/auth/backend"
import { validateEnvironment } from "../../mobile/src/config/environment"
import { emailValidationError, isEmailCode, DEFAULT_FILTERS } from "@illirent/core"
import { ApiError } from "@illirent/api-client"

function memory() {
  const values = new Map<string, string>()
  const store = {
    async getItemAsync(key: string) { return values.get(key) ?? null },
    async setItemAsync(key: string, value: string) { assert.ok(Buffer.byteLength(value) <= 1800); values.set(key, value) },
    async deleteItemAsync(key: string) { values.delete(key) },
  }
  return { values, store }
}
test("large Unicode sessions survive restart; concurrent rotations leave only the latest session", async () => {
  const { values, store } = memory()
  const storage = createSecureStorage(store, randomUUID)
  const session = JSON.stringify({ token: "secret".repeat(1000), metadata: "🏠校园".repeat(800) })
  await storage.setItem("auth", session)
  assert.equal(await createSecureStorage(store, randomUUID).getItem("auth"), session)
  await Promise.all([storage.setItem("auth", "rotated"), storage.setItem("auth", "latest")])
  assert.equal(await storage.getItem("auth"), "latest")
  assert.equal(values.size, 2)
  await storage.removeItem("auth")
  assert.equal(values.size, 0)
})
test("partial write failure preserves the previous session and does not poison the queue", async () => {
  const { store } = memory()
  let id = 0
  const storage = createSecureStorage({ ...store, async setItemAsync(key, value) {
    if (key.endsWith(".generation2.1")) throw new Error("Keychain full")
    await store.setItemAsync(key, value)
  } }, () => `generation${++id}`)
  await storage.setItem("auth", "previous")
  await assert.rejects(storage.setItem("auth", "next".repeat(500)), /Keychain full/)
  assert.equal(await storage.getItem("auth"), "previous")
  await storage.setItem("auth", "recovered")
  assert.equal(await storage.getItem("auth"), "recovered")
})
test("corrupt or incomplete storage is surfaced and can be cleared", async () => {
  const { values, store } = memory()
  const storage = createSecureStorage(store, randomUUID)
  values.set("auth", "corrupt")
  await assert.rejects(storage.getItem("auth"))
  await storage.removeItem("auth")
  await storage.setItem("auth", "saved")
  const m = JSON.parse(values.get("auth")!)
  values.delete(`auth.${m.id}.0`)
  await assert.rejects(storage.getItem("auth"), /incomplete/)
  await storage.removeItem("auth")
  assert.equal(await storage.getItem("auth"), null)
})
const session = { access_token: "token", user: { id: "student" } } as Session
function fakeAuth() {
  let notify: (event: AuthChangeEvent, value: Session | null) => void = () => {}
  let refreshes = 0, stops = 0, unsubscribed = false
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange(callback: typeof notify) { notify = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true } } } } },
    startAutoRefresh() { refreshes++ },
    stopAutoRefresh() { stops++ },
  }
  let change: (state: string) => void = () => {}
  let removed = false
  const lifecycle = { currentState: "active", addEventListener(_event: "change", callback: typeof change) { change = callback; return { remove() { removed = true } } } }
  return { auth, lifecycle, notify: (event: AuthChangeEvent, value: Session | null) => notify(event, value), change: (value: string) => change(value), counts: () => ({ refreshes, stops, unsubscribed, removed }) }
}
const tick = () => new Promise<void>(resolve => setImmediate(() => resolve()))
test("restoration gates routes, resumes refresh only when active, and cleans up subscriptions", async () => {
  const fake = fakeAuth()
  const store = createSessionStore(fake.auth as unknown as SupabaseClient["auth"], fake.lifecycle)
  assert.equal(store.getSnapshot().status, "restoring")
  const stop = store.start()
  await tick()
  assert.equal(store.getSnapshot().session, session)
  fake.change("background"); fake.change("active")
  assert.equal(fake.counts().refreshes, 2)
  fake.notify("SIGNED_OUT", null)
  assert.equal(store.getSnapshot().session, null)
  stop()
  assert.deepEqual(fake.counts(), { refreshes: 2, stops: 2, unsubscribed: true, removed: true })
})
test("late restoration cannot resurrect a signed-out session", async () => {
  const fake = fakeAuth()
  let finish!: (value: { data: { session: Session }; error: null }) => void
  fake.auth.getSession = () => new Promise(resolve => { finish = resolve })
  const store = createSessionStore(fake.auth as unknown as SupabaseClient["auth"], fake.lifecycle)
  const stop = store.start()
  fake.notify("SIGNED_OUT", null)
  finish({ data: { session }, error: null })
  await tick()
  assert.equal(store.getSnapshot().session, null)
  stop()
})
test("restoration errors remain recoverable; initial auth callbacks cannot hide them", async () => {
  const fake = fakeAuth()
  fake.auth.getSession = async () => { throw new Error("Keychain unavailable") }
  const store = createSessionStore(fake.auth as unknown as SupabaseClient["auth"], fake.lifecycle)
  const stop = store.start()
  fake.notify("INITIAL_SESSION", null)
  await tick()
  assert.equal(store.getSnapshot().status, "error")
  fake.auth.getSession = async () => ({ data: { session }, error: null })
  await store.restore()
  assert.equal(store.getSnapshot().session, session)
  stop()
})
const fixture = JSON.parse(readFileSync(new URL("../shared/fixtures/listings.json", import.meta.url), "utf8"))
test("concurrent 401s share a refresh and retry using the new token", async () => {
  let token = "old", refreshes = 0, requests = 0
  const auth = {
    getSession: async () => ({ data: { session: { access_token: token } }, error: null }),
    refreshSession: async () => { refreshes++; await tick(); token = "new"; return { data: { session: { access_token: token } }, error: null } },
  }
  const api = createAuthenticatedApi("https://api.example.test", auth as unknown as SupabaseClient["auth"], async () => { assert.fail("must not expire valid session") }, (async (_url, init) => {
    requests++
    return new Headers(init?.headers).get("authorization") === "Bearer new" ? Response.json(fixture) : Response.json({}, { status: 401 })
  }) as typeof fetch)
  await Promise.all([api.fetchListingsPage(DEFAULT_FILTERS, 1, 5), api.fetchListingsPage(DEFAULT_FILTERS, 1, 5)])
  assert.equal(refreshes, 1)
  assert.equal(requests, 4)
})
test("a second 401 expires the session instead of looping", async () => {
  let expired = 0, requests = 0
  const auth = { getSession: async () => ({ data: { session }, error: null }), refreshSession: async () => ({ data: { session }, error: null }) }
  const api = createAuthenticatedApi("https://api.example.test", auth as unknown as SupabaseClient["auth"], async () => { expired++ }, (async () => { requests++; return Response.json({}, { status: 401 }) }) as typeof fetch)
  await assert.rejects(api.fetchListingsPage(DEFAULT_FILTERS, 1, 5), error => error instanceof ApiError && error.status === 401)
  assert.equal(expired, 1)
  assert.equal(requests, 2)
})
test("offline refresh keeps the saved session", async () => {
  let expired = false
  const auth = { getSession: async () => ({ data: { session }, error: null }), refreshSession: async () => ({ data: { session: null }, error: { name: "AuthRetryableFetchError" } }) }
  const api = createAuthenticatedApi("https://api.example.test", auth as unknown as SupabaseClient["auth"], async () => { expired = true }, (async () => Response.json({}, { status: 401 })) as typeof fetch)
  await assert.rejects(api.fetchListingsPage(DEFAULT_FILTERS, 1, 5), error => error instanceof ApiError && error.kind === "network")
  assert.equal(expired, false)
})
test("email eligibility and 8-digit OTP match web rules", () => {
  for (const email of ["student@illinois.edu", "student@school.edu.au", "student@gmail.com", "student@outlook.com"]) assert.equal(emailValidationError(email), null)
  for (const email of ["", "invalid", "person@example.com"]) assert.ok(emailValidationError(email))
  assert.ok(isEmailCode("12345678")); assert.ok(!isEmailCode("123456"))
})
test("configuration rejects secret keys, service-role JWTs, and release HTTP", () => {
  const env = { supabaseUrl: "https://example.supabase.co", supabaseKey: "sb_publishable_example", apiUrl: "http://10.0.2.2:3101" }
  assert.equal(validateEnvironment(env, true).apiUrl, env.apiUrl)
  assert.throws(() => validateEnvironment(env, false), /HTTPS/)
  assert.throws(() => validateEnvironment({ ...env, supabaseKey: "sb_secret_private" }, true), /secret/)
  const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`
  assert.throws(() => validateEnvironment({ ...env, supabaseKey: jwt }, true), /anon key/)
  assert.throws(() => validateEnvironment({ ...env, apiUrl: "https://api.example.test/api" }, true), /origins/)
})

test("Supabase email OTP persists a session that a new client restores without another email", async () => {
  const { AuthClient } = await import("@supabase/supabase-js")
  const { store } = memory()
  const storage = createSecureStorage(store, randomUUID)
  const calls: string[] = []
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600, sub: "student", aud: "authenticated" })}.test-signature`
  const fetch = (async (input, init) => {
    const path = new URL(String(input)).pathname
    const body = JSON.parse(String(init?.body))
    calls.push(path)
    if (path.endsWith("/otp")) {
      assert.equal(body.email, "student@illinois.edu")
      assert.equal(body.create_user, true)
      return Response.json({})
    }
    if (path.endsWith("/verify")) {
      assert.equal(body.type, "email"); assert.equal(body.token, "12345678")
      return Response.json({ access_token: accessToken, refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer", user: { id: "student", email: "student@illinois.edu", aud: "authenticated", created_at: new Date().toISOString() } })
    }
    throw new Error(`Unexpected auth request: ${path}`)
  }) as typeof globalThis.fetch
  const options = { url: "https://example.supabase.co/auth/v1", storage, storageKey: "test-auth", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, fetch }
  const first = new AuthClient(options)
  const sent = await first.signInWithOtp({ email: "student@illinois.edu", options: { shouldCreateUser: true } })
  assert.equal(sent.error, null)
  const verified = await first.verifyOtp({ email: "student@illinois.edu", token: "12345678", type: "email" })
  assert.equal(verified.error, null)
  const restarted = new AuthClient(options)
  const restored = await restarted.getSession()
  assert.equal(restored.error, null)
  assert.equal(restored.data.session?.access_token, accessToken)
  assert.deepEqual(calls, ["/auth/v1/otp", "/auth/v1/verify"])
  first.stopAutoRefresh(); restarted.stopAutoRefresh()
})

test("auth fetch aborts stalled requests instead of leaving logout pending", async () => {
  const { createAuthFetch } = await import("../../mobile/src/auth/transport")
  const fetch = createAuthFetch((async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
  })) as typeof globalThis.fetch, 10)
  await assert.rejects(fetch("https://example.supabase.co/auth/v1/logout"), { name: "AbortError" })
})
