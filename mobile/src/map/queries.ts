import { queryOptions } from "@tanstack/react-query"
import { ApiError } from "@illirent/api-client"
import type { Filters, Listing, ListingSort } from "@illirent/core"
import { canonicalFilters } from "../browse/filters"

export interface MapApi {
  fetchAllListings(filters: Filters, sort?: ListingSort, options?: { signal?: AbortSignal }): Promise<Listing[]>
}
export function mapQueryOptions(api: MapApi, userId: string, filters: Filters) {
  const normalized = canonicalFilters(filters)
  return queryOptions({
    queryKey: ["map-listings", userId, normalized] as const,
    enabled: !!userId,
    queryFn: ({ signal }) => api.fetchAllListings(normalized, undefined, { signal }),
    staleTime: 60000,
    retry: (count, error) => count < 1 && !(error instanceof ApiError && (error.status === 401 || error.kind === "invalid-response")),
  })
}
