import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { DEFAULT_FILTERS, availabilityStatus, bedsLabel } from "@illirent/core"
import { ApiError, buildListingParams, createApiClient } from "@illirent/api-client"
import { colors } from "@illirent/design-tokens"

const fixture = JSON.parse(readFileSync(new URL("./fixtures/listings.json", import.meta.url), "utf8"))
const json = (value: unknown) => Response.json(value)
const transport = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  ((url, init) => handler(String(url), init ?? {})) as typeof fetch

test("filters preserve repeated values, studio, zero floor, and untouched tolerance", () => {
  assert.equal(buildListingParams(DEFAULT_FILTERS).toString(), "")
  const params = buildListingParams({ ...DEFAULT_FILTERS, beds: [0, 5], company: ["Green Street Realty", "Smile Student Living"], min_price_per_bed: 0, max_price_per_bed: 900, penthouse: false, availability_window: "august_2027" })
  assert.deepEqual(params.getAll("beds"), ["0", "5"])
  assert.deepEqual(params.getAll("company"), ["Green Street Realty", "Smile Student Living"])
  assert.equal(params.get("min_price_per_bed"), "0")
  assert.equal(params.get("max_price_per_bed"), "900")
  assert.equal(params.get("penthouse"), "false")
  assert.equal(params.get("availability_window"), "august_2027")
  assert.equal(params.has("buffer_type"), false)
  const buffered = buildListingParams({ ...DEFAULT_FILTERS, min_price_per_bed: 700, max_price_per_bed: 900, buffer_type: "percent", buffer_value: 15 })
  assert.equal(buffered.get("min_price_per_bed"), "700")
  assert.equal(buffered.get("max_price_per_bed"), "900") // Server alone applies tolerance.
  assert.equal(buffered.get("buffer_value"), "15")
})

test("web keeps same-origin cookie transport and matches the backend fixture", async () => {
  const api = createApiClient({ baseUrl: "", fetch: transport((url, init) => {
    assert.equal(url, "/api/listings?page=2&page_size=12&sort=price_asc")
    assert.equal(init.headers, undefined)
    return json(fixture)
  }) })
  assert.deepEqual(await api.fetchListingsPage(DEFAULT_FILTERS, 2, 12, "price_asc"), fixture)
})

test("native transport uses current bearer token on each request; status stays public", async () => {
  let token = "first"
  const seen: (string | null)[] = []
  const api = createApiClient({ baseUrl: "https://api.example.test/", getAccessToken: async () => token,
    fetch: transport((url, init) => {
      assert.ok(url.startsWith("https://api.example.test/api/"))
      seen.push(new Headers(init.headers).get("authorization"))
      return url.endsWith("/status") ? json({ last_scraped: null, last_scraped_at: null, listing_count: null, property_count: null }) : json(fixture)
    }) })
  await api.fetchAllListings(DEFAULT_FILTERS)
  token = "rotated"
  await api.fetchAllListings(DEFAULT_FILTERS)
  await api.fetchStatus()
  assert.deepEqual(seen, ["Bearer first", "Bearer rotated", null])
})

test("empty and unpaginated results retain compatibility", async () => {
  const api = createApiClient({ baseUrl: "", fetch: transport(() => json({ listings: [] })) })
  assert.deepEqual(await api.fetchListingsPage(DEFAULT_FILTERS, 1, 12), { listings: [], total: 0 })
})

test("unauthorized, malformed payloads, HTML redirects, and network errors remain distinguishable", async () => {
  for (const [response, kind, status] of [
    [() => new Response("", { status: 401 }), "http", 401],
    [() => json({ listings: [{}] }), "invalid-response", undefined],
    [() => new Response("<html>login</html>"), "invalid-response", undefined],
    [() => { throw new TypeError("offline") }, "network", undefined],
  ] as const) {
    const api = createApiClient({ baseUrl: "", fetch: transport(response) })
    await assert.rejects(api.fetchAllListings(DEFAULT_FILTERS), error => error instanceof ApiError && error.kind === kind && error.status === status)
  }
})

test("timeouts and caller cancellation abort transport", async () => {
  const fetch = transport((_url, init) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"))
    if (init.signal?.aborted) abort()
    else init.signal?.addEventListener("abort", abort, { once: true })
  }))
  const api = createApiClient({ baseUrl: "", fetch, timeoutMs: 10 })
  await assert.rejects(api.fetchStatus(), error => error instanceof ApiError && error.kind === "timeout")
  const controller = new AbortController()
  const result = api.fetchStatus({ signal: controller.signal })
  controller.abort()
  await assert.rejects(result, { name: "AbortError" })
})

test("availability helpers retain studio and immediate-move-in semantics", () => {
  assert.equal(bedsLabel(0, "Studio apartment"), "Studio")
  assert.equal(bedsLabel(0, "Individual lease"), "")
  assert.equal(availabilityStatus("Immediate Move-In! Available August 2027"), "now")
  assert.equal(availabilityStatus("Not available"), "unavailable")
})

test("web CSS and native palette stay identical", () => {
  const css = readFileSync(new URL("../../packages/design-tokens/theme.css", import.meta.url), "utf8")
  const cssColors = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[\da-fA-F]+);/g)].map(([, key, value]) => [key, value]))
  assert.deepEqual(colors, cssColors)
})

test("unknown bedroom counts in real snapshots are accepted without a misleading label", async () => {
  const listing = { ...fixture.listings[0], beds: null }
  const api = createApiClient({ baseUrl: "", fetch: transport(() => json({ listings: [listing] })) })
  assert.deepEqual(await api.fetchAllListings(DEFAULT_FILTERS), [listing])
  assert.equal(bedsLabel(null, "Unknown unit"), "")
})
