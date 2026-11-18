import type { DataStatus, Filters, Listing, ListingsPage, ListingSort } from "@illirent/core"
import { buildListingParams } from "./params"
export { buildListingParams } from "./params"

export type ApiErrorKind = "http" | "network" | "timeout" | "invalid-response"
export class ApiError extends Error {
  constructor(message: string, public readonly kind: ApiErrorKind, public readonly status?: number) {
    super(message)
    this.name = "ApiError"
  }
}
export interface ApiClientOptions {
  /** Origin, e.g. https://api.example.com. Empty keeps same-origin web requests. */
  baseUrl: string
  getAccessToken?: () => Promise<string | null>
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}
export interface RequestOptions { signal?: AbortSignal }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function invalid(): never { throw new ApiError("Invalid API response", "invalid-response") }
const stringFields = ["company", "address", "unit_type", "price_note", "availability", "area", "url", "photo_url", "availability_summary", "tagline", "description", "amenities", "lease_dates", "utility_fees", "brochure_url", "property_type"] as const
const numberFields = ["price_per_bed_low", "price_per_bed_high", "price_total_low", "price_total_high", "lat", "lng"] as const
const nullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value))
function listingsPayload(value: unknown): { listings: Listing[]; total?: number } {
  if (!record(value) || !Array.isArray(value.listings)) return invalid()
  for (const listing of value.listings) {
    if (!record(listing) || !stringFields.every(key => typeof listing[key] === "string") ||
        !numberFields.every(key => nullableNumber(listing[key])) ||
        !nullableNumber(listing.beds) ||
        typeof listing.is_available !== "boolean") return invalid()
  }
  if (value.total !== undefined && (!Number.isInteger(value.total) || (value.total as number) < 0)) return invalid()
  return value as { listings: Listing[]; total?: number }
}
function statusPayload(value: unknown): DataStatus {
  if (!record(value) || !["last_scraped", "last_scraped_at"].every(key => value[key] === null || typeof value[key] === "string") ||
      !["listing_count", "property_count"].every(key => nullableNumber(value[key]))) return invalid()
  if (value.freshness !== undefined) {
    const f = value.freshness
    if (!record(f) || !["fresh", "stale", "critical", "unknown"].includes(String(f.state)) ||
        !(f.last_successful_check_at === null || typeof f.last_successful_check_at === "string") ||
        !nullableNumber(f.age_hours) || !Array.isArray(f.stale_sources) || !f.stale_sources.every(s => typeof s === "string")) return invalid()
  }
  return value as unknown as DataStatus
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? 15000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive")
  async function request(path: string, authenticated: boolean, requestOptions: RequestOptions = {}): Promise<unknown> {
    const token = authenticated ? await options.getAccessToken?.() : null
    const controller = new AbortController()
    const abort = () => controller.abort(requestOptions.signal?.reason)
    if (requestOptions.signal?.aborted) abort()
    else requestOptions.signal?.addEventListener("abort", abort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const res = await (options.fetch ?? globalThis.fetch)(`${baseUrl}${path}`, {
        signal: controller.signal,
        ...(authenticated ? {} : { cache: "no-store" as const }),
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      })
      if (!res.ok) throw new ApiError(`API error: ${res.status}`, "http", res.status)
      if (res.redirected || !res.headers.get("content-type")?.includes("application/json")) return invalid()
      try { return await res.json() } catch { return invalid() }
    } catch (error) {
      if (requestOptions.signal?.aborted) throw error
      if (timedOut) throw new ApiError("API request timed out", "timeout")
      if (error instanceof ApiError) throw error
      throw new ApiError("Could not reach API", "network")
    } finally {
      clearTimeout(timer)
      requestOptions.signal?.removeEventListener("abort", abort)
    }
  }
  return {
    async fetchStatus(requestOptions?: RequestOptions): Promise<DataStatus> {
      return statusPayload(await request("/api/status", false, requestOptions))
    },
    async fetchAllListings(filters: Filters, sort?: ListingSort, requestOptions?: RequestOptions): Promise<Listing[]> {
      const params = buildListingParams(filters)
      if (sort) params.set("sort", sort)
      return listingsPayload(await request(`/api/listings?${params}`, true, requestOptions)).listings
    },
    async fetchListingsPage(filters: Filters, page: number, pageSize: number, sort?: ListingSort, requestOptions?: RequestOptions): Promise<ListingsPage> {
      const params = buildListingParams(filters)
      params.set("page", String(page))
      params.set("page_size", String(pageSize))
      if (sort) params.set("sort", sort)
      const data = listingsPayload(await request(`/api/listings?${params}`, true, requestOptions))
      return { listings: data.listings, total: data.total ?? data.listings.length }
    },
  }
}
