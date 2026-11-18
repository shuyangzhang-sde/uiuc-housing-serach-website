import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_FILTERS, type Listing } from "@illirent/core"
import { createAuthenticatedApi } from "../../mobile/src/auth/backend"
import { buildMapData, locationBounds } from "../../mobile/src/map/data"
import { mapQueryOptions, type MapApi } from "../../mobile/src/map/queries"
import { listingQueryOptions, type BrowseApi } from "../../mobile/src/browse/queries"

const fixture = JSON.parse(readFileSync(new URL("../shared/fixtures/listings.json", import.meta.url), "utf8"))
const listing = fixture.listings[0] as Listing
const at = (lat: number | null, lng: number | null, extra: Partial<Listing> = {}): Listing => ({ ...listing, lat, lng, ...extra })
const queryClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } })

test("all floor plans at coincident coordinates remain reachable through one location pin", () => {
  const input = [at(40.11, -88.22, { unit_type: "Studio" }), at(40.11000001, -88.22000001, { unit_type: "2 bedroom" }), at(40.12, -88.23)]
  const result = buildMapData(input)
  assert.equal(result.groups.length, 2)
  assert.equal(result.mapped, 3)
  assert.equal(result.groups[0].listings.length, 2)
  assert.equal(result.geojson.features[0].properties.count, 2)
  assert.deepEqual(result.geojson.features[0].geometry.coordinates, [-88.22, 40.11])
  assert.deepEqual(input.map(item => item.unit_type), ["Studio", "2 bedroom", listing.unit_type])
})
test("missing or invalid coordinates are counted without dropping valid zero coordinates", () => {
  const result = buildMapData([at(null, -88), at(40, null), at(NaN, -88), at(40, Infinity), at(91, -88), at(40, -181), at(0, 0)])
  assert.equal(result.missing, 6)
  assert.equal(result.mapped, 1)
  assert.deepEqual(result.groups[0].coordinates, [0, 0])
})
test("map price labels honor source notes, unknown prices, zero prices, and availability", () => {
  const samePlace = [at(40, -88, { price_note: "", price_per_bed_low: 700, availability: "Leased" }), at(40, -88, { price_note: "", price_per_bed_low: 550, availability: "Available Now" })]
  const feature = buildMapData(samePlace).geojson.features[0]
  assert.equal(feature.properties.label, "$550")
  assert.equal(feature.properties.available, true)
  assert.equal(buildMapData([at(40, -88, { price_note: "Ask manager", price_per_bed_low: 0 })]).geojson.features[0].properties.label, "—")
  assert.equal(buildMapData([at(40, -88, { price_note: "", price_per_bed_low: 0 })]).geojson.features[0].properties.label, "$0")
  assert.equal(buildMapData([at(40, -88, { price_note: "", price_per_bed_low: null, beds: 2, price_total_low: 1000 })]).geojson.features[0].properties.label, "—")
})
test("bounds use longitude/latitude order and expand a single point for a usable camera fit", () => {
  assert.equal(locationBounds([]), null)
  const single = locationBounds(buildMapData([at(40, -88)]).groups)!
  assert.ok(single[0] < -88 && single[2] > -88 && single[1] < 40 && single[3] > 40)
  assert.deepEqual(locationBounds(buildMapData([at(40, -88), at(41, -87)]).groups), [-88, 40, -87, 41])
})
test("map requests all matching listings with shared repeated filters and current bearer token", async () => {
  const auth = { getSession: async () => ({ data: { session: { access_token: "current-token" } }, error: null }) }
  const api = createAuthenticatedApi("https://api.example.test", auth as unknown as SupabaseClient["auth"], async () => { assert.fail("must not expire session") }, (async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, "/api/listings")
    assert.equal(url.searchParams.has("page"), false)
    assert.equal(url.searchParams.has("page_size"), false)
    assert.deepEqual(url.searchParams.getAll("beds"), ["0", "5"])
    assert.deepEqual(url.searchParams.getAll("company"), ["Bankier Apartments", "Smile Student Living"])
    assert.equal(url.searchParams.get("max_price_per_bed"), "900")
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer current-token")
    return Response.json(fixture)
  }) as typeof fetch)
  const filters = { ...DEFAULT_FILTERS, beds: [5, 0], company: ["Smile Student Living", "Bankier Apartments"], max_price_per_bed: 900 }
  const qc = queryClient()
  try { assert.deepEqual(await qc.fetchQuery(mapQueryOptions(api, "student", filters)), fixture.listings) } finally { qc.clear() }
})
test("Browse and Map receive identical applied filters while retaining separate pagination caches", async () => {
  const calls: { surface: string; filters: unknown }[] = []
  const api: BrowseApi & MapApi = {
    async fetchAllListings(filters) { calls.push({ surface: "map", filters }); return [listing] },
    async fetchListingsPage(filters) { calls.push({ surface: "browse", filters }); return { listings: [listing], total: 1 } },
    async fetchStatus() { return { last_scraped: null, last_scraped_at: null, listing_count: null, property_count: null } },
  }
  const qc = queryClient()
  const filters = { ...DEFAULT_FILTERS, beds: [2], max_price_per_bed: 900, availability_window: "august_2027" as const }
  try {
    const browse = listingQueryOptions(api, "student", filters, "price_asc")
    const map = mapQueryOptions(api, "student", filters)
    await qc.fetchInfiniteQuery(browse)
    await qc.fetchQuery(map)
    assert.deepEqual(calls[0].filters, calls[1].filters)
    assert.ok(qc.getQueryData(browse.queryKey))
    assert.ok(qc.getQueryData(map.queryKey))
    assert.notDeepEqual(map.queryKey, mapQueryOptions(api, "different-user", filters).queryKey)
    assert.deepEqual(map.queryKey, mapQueryOptions(api, "student", { ...filters, beds: [2, 2] }).queryKey)
  } finally { qc.clear() }
})
test("a rapid map filter change cancels old results and prevents stale pins from returning", async () => {
  let oldSignal: AbortSignal | undefined
  let finish!: (listings: Listing[]) => void
  const api: MapApi = { fetchAllListings(filters, _sort, options) {
    if (!filters.company) { oldSignal = options?.signal; return new Promise(resolve => { finish = resolve }) }
    return Promise.resolve([])
  } }
  const qc = queryClient()
  const observer = new QueryObserver(qc, mapQueryOptions(api, "student", DEFAULT_FILTERS))
  const unsubscribe = observer.subscribe(() => {})
  try {
    observer.setOptions(mapQueryOptions(api, "student", { ...DEFAULT_FILTERS, company: ["Smile Student Living"] }))
    await observer.refetch({ cancelRefetch: false })
    assert.equal(oldSignal?.aborted, true)
    finish([listing])
    await new Promise<void>(resolve => setImmediate(() => resolve()))
    assert.deepEqual(observer.getCurrentResult().data, [])
  } finally { unsubscribe(); observer.destroy(); qc.clear() }
})
