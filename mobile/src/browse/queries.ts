import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"
import { ApiError } from "@illirent/api-client"
import type { DataStatus, Filters, ListingsPage, ListingSort } from "@illirent/core"
import { canonicalFilters } from "./filters"

export const PAGE_SIZE = 24
export interface BrowseApi {
  fetchListingsPage(filters: Filters, page: number, pageSize: number, sort?: ListingSort, options?: { signal?: AbortSignal }): Promise<ListingsPage>
  fetchStatus(options?: { signal?: AbortSignal }): Promise<DataStatus>
}
export function listingQueryOptions(api: BrowseApi, userId: string, filters: Filters, sort: ListingSort) {
  const normalized = canonicalFilters(filters)
  return infiniteQueryOptions({
    queryKey: ["listings", userId, normalized, sort] as const,
    enabled: !!userId,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.fetchListingsPage(normalized, pageParam, PAGE_SIZE, sort, { signal }),
    getNextPageParam: (lastPage, _pages, lastPageParam) => lastPage.listings.length > 0 && lastPageParam * PAGE_SIZE < lastPage.total ? lastPageParam + 1 : undefined,
    staleTime: 60000,
    retry: (count, error) => count < 1 && !(error instanceof ApiError && (error.status === 401 || error.kind === "invalid-response")),
  })
}
export function statusQueryOptions(api: BrowseApi) {
  return queryOptions({ queryKey: ["data-status"], queryFn: ({ signal }) => api.fetchStatus({ signal }), staleTime: 60000, retry: 1 })
}
