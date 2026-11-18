import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query"
import { ApiError } from "@illirent/api-client"
import { DEFAULT_FILTERS, listingPrice, priceRangeText, httpUrl, type Listing, type ListingsPage } from "@illirent/core"
import { applyFilterDraft, canonicalFilters, createFilterDraft, toggleSelection } from "../../mobile/src/browse/filters"
import { listingQueryOptions, PAGE_SIZE, type BrowseApi } from "../../mobile/src/browse/queries"

const listing = JSON.parse(readFileSync(new URL("../shared/fixtures/listings.json", import.meta.url), "utf8")).listings[0] as Listing
function page(count: number, total: number): ListingsPage { return { listings: Array.from({ length: count }, (_, i) => ({ ...listing, address: `Property ${i}` })), total } }
const status: BrowseApi["fetchStatus"] = async () => ({ last_scraped: null, last_scraped_at: null, listing_count: null, property_count: null })
const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } })

test("draft changes and reset leave applied filters intact until Apply", () => {
  const applied = { ...DEFAULT_FILTERS, beds: [2], company: ["Smile Student Living"], max_price_per_bed: 900 }
  const draft = createFilterDraft(applied)
  draft.filters.beds!.push(3)
  draft.maximum = "1000"
  assert.deepEqual(applied.beds, [2]); assert.equal(applied.max_price_per_bed, 900)
  const result = applyFilterDraft(draft)
  assert.equal(result.filters?.max_price_per_bed, 1000)
  assert.deepEqual(result.filters?.beds, [2, 3])
  assert.deepEqual(createFilterDraft().filters, DEFAULT_FILTERS)
})
test("price draft validates whole dollars, zero, bounds, and explicit max tolerance", () => {
  const draft = createFilterDraft()
  draft.minimum = "0"; draft.maximum = "900"; draft.filters.buffer_type = "percent"; draft.tolerance = "15"
  assert.deepEqual(applyFilterDraft(draft).filters, { ...DEFAULT_FILTERS, min_price_per_bed: 0, max_price_per_bed: 900, buffer_type: "percent", buffer_value: 15 })
  draft.tolerance = "0"
  assert.equal(applyFilterDraft(draft).filters?.buffer_value, 0)
  draft.tolerance = ""
  assert.ok(applyFilterDraft(draft).error)
  draft.maximum = ""
  assert.equal(applyFilterDraft(draft).filters?.buffer_type, null)
  for (const value of ["-1", "9.5", "abc", "1000000"]) {
    draft.minimum = value; assert.ok(applyFilterDraft(draft).error)
  }
  draft.minimum = "901"; draft.maximum = "900"
  assert.ok(applyFilterDraft(draft).error)
})
test("single property type clears incompatible penthouse selection and empty multi-select means all", () => {
  const draft = createFilterDraft({ ...DEFAULT_FILTERS, property_type: "House", penthouse: true })
  assert.equal(applyFilterDraft(draft).filters?.penthouse, null)
  assert.deepEqual(toggleSelection([0, 5], 0), [5])
  assert.equal(toggleSelection([5], 5), null)
  assert.deepEqual(toggleSelection(null, 0), [0])
})
test("equivalent multi-selects share a cache key without mutating the applied arrays", () => {
  const filters = { ...DEFAULT_FILTERS, beds: [5, 0, 5], company: ["Smile", "Bankier"] }
  const api = { fetchListingsPage: async () => page(0, 0), fetchStatus: status }
  const first = listingQueryOptions(api, "student", filters, "beds")
  const second = listingQueryOptions(api, "student", { ...filters, beds: [0, 5], company: ["Bankier", "Smile"] }, "beds")
  assert.deepEqual(first.queryKey, second.queryKey)
  assert.deepEqual(filters.beds, [5, 0, 5])
  assert.deepEqual(canonicalFilters({ ...DEFAULT_FILTERS, beds: [], company: [] }), DEFAULT_FILTERS)
  assert.notDeepEqual(first.queryKey, listingQueryOptions(api, "another-student", filters, "beds").queryKey)
})
test("pagination forwards server filters and sorting, then stops at the reported total", async () => {
  const calls: { pageNumber: number; size: number; sort: string | undefined }[] = []
  const api: BrowseApi = { fetchStatus: status, async fetchListingsPage(filters, pageNumber, size, sort) {
    assert.deepEqual(filters.beds, [0, 5])
    calls.push({ pageNumber, size, sort })
    return page(pageNumber === 1 ? PAGE_SIZE : 1, PAGE_SIZE + 1)
  } }
  const qc = client()
  const observer = new InfiniteQueryObserver(qc, listingQueryOptions(api, "student", { ...DEFAULT_FILTERS, beds: [5, 0] }, "price_asc"))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await observer.refetch({ cancelRefetch: false })
    await observer.fetchNextPage()
    assert.equal(observer.getCurrentResult().data?.pages.length, 2)
    assert.equal(observer.getCurrentResult().hasNextPage, false)
    await observer.fetchNextPage()
    assert.deepEqual(calls, [{ pageNumber: 1, size: 24, sort: "price_asc" }, { pageNumber: 2, size: 24, sort: "price_asc" }])
    observer.setOptions(listingQueryOptions(api, "student", { ...DEFAULT_FILTERS, beds: [0, 5] }, "price_desc"))
    await observer.refetch({ cancelRefetch: false })
    assert.deepEqual(calls.at(-1), { pageNumber: 1, size: 24, sort: "price_desc" })
  } finally { unsubscribe(); observer.destroy(); qc.clear() }
})
test("switching filters aborts the previous request and never displays its late response", async () => {
  let oldSignal: AbortSignal | undefined
  let finishOld!: (page: ListingsPage) => void
  const api: BrowseApi = { fetchStatus: status, fetchListingsPage(filters, _page, _size, _sort, options) {
    if (filters.max_price_per_bed == null) {
      oldSignal = options?.signal
      // Simulate a transport that cannot stop an already received response.
      return new Promise(resolve => { finishOld = resolve })
    }
    return Promise.resolve(page(1, 1))
  } }
  const qc = client()
  const observer = new InfiniteQueryObserver(qc, listingQueryOptions(api, "student", DEFAULT_FILTERS, "beds"))
  const unsubscribe = observer.subscribe(() => {})
  try {
    observer.setOptions(listingQueryOptions(api, "student", { ...DEFAULT_FILTERS, max_price_per_bed: 900 }, "beds"))
    await observer.refetch({ cancelRefetch: false })
    assert.equal(oldSignal?.aborted, true)
    finishOld(page(24, 1306))
    await new Promise<void>(resolve => setImmediate(() => resolve()))
    assert.equal(observer.getCurrentResult().data?.pages[0].total, 1)
  } finally { unsubscribe(); observer.destroy(); qc.clear() }
})
test("failed next page preserves loaded results and supports a successful retry", async () => {
  let fail = true
  const api: BrowseApi = { fetchStatus: status, async fetchListingsPage(_filters, pageNumber) {
    if (pageNumber === 2 && fail) throw new ApiError("Unavailable", "http", 503)
    return page(pageNumber === 1 ? PAGE_SIZE : 1, PAGE_SIZE + 1)
  } }
  const qc = client()
  const observer = new InfiniteQueryObserver(qc, listingQueryOptions(api, "student", DEFAULT_FILTERS, "beds"))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await observer.refetch({ cancelRefetch: false })
    await observer.fetchNextPage()
    assert.equal(observer.getCurrentResult().isFetchNextPageError, true)
    assert.equal(observer.getCurrentResult().data?.pages[0].listings.length, PAGE_SIZE)
    fail = false
    await observer.fetchNextPage()
    assert.equal(observer.getCurrentResult().isFetchNextPageError, false)
    assert.equal(observer.getCurrentResult().data?.pages.length, 2)
  } finally { unsubscribe(); observer.destroy(); qc.clear() }
})
test("empty results do not request endless extra pages", async () => {
  let calls = 0
  const api: BrowseApi = { fetchStatus: status, async fetchListingsPage() { calls++; return page(0, 0) } }
  const qc = client()
  const observer = new InfiniteQueryObserver(qc, listingQueryOptions(api, "student", DEFAULT_FILTERS, "beds"))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await observer.refetch({ cancelRefetch: false }); await observer.fetchNextPage()
    assert.equal(calls, 1); assert.equal(observer.getCurrentResult().hasNextPage, false)
  } finally { unsubscribe(); observer.destroy(); qc.clear() }
})
test("pricing preserves ranges and notes without inventing total prices", () => {
  assert.equal(priceRangeText(0, 0), "$0")
  assert.equal(priceRangeText(null, 900), "—")
  assert.equal(priceRangeText(700, 900), "$700–$900")
  const base = { ...listing, price_note: "", beds: 2, price_per_bed_low: 700, price_per_bed_high: 900, price_total_low: null }
  assert.deepEqual(listingPrice(base), { text: "$700–$900", caption: "per bed / month" })
  assert.equal(listingPrice({ ...base, price_note: "Contact manager" }).text, "Contact manager")
  assert.equal(listingPrice({ ...base, beds: 0, price_total_low: 1000, price_total_high: 1000 }).caption, "total / month")
  assert.equal(listingPrice({ ...base, price_per_bed_low: null }).text, "Ask for pricing")
})
test("external listing and brochure links accept web URLs, reject executable schemes and credentials", () => {
  for (const value of ["javascript:alert(1)", "file:///private/data", "https://user:password@example.com", "/relative", ""]) assert.equal(httpUrl(value), null)
  assert.equal(httpUrl("https://example.com/property?unit=2"), "https://example.com/property?unit=2")
})
