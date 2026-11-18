// Keep the web API surface stable while sharing contracts and transport with native.
export type { Listing, Filters, ListingSort, ListingsPage, DataStatus } from "@illirent/core"
export { DEFAULT_FILTERS } from "@illirent/core"
import { createApiClient } from "@illirent/api-client"

// Same-origin Next.js routes retain responsibility for cookies and bearer forwarding.
const api = createApiClient({ baseUrl: "" })
export const fetchAllListings = api.fetchAllListings
export const fetchListingsPage = api.fetchListingsPage
export async function fetchStatus() {
  try {
    return await api.fetchStatus()
  } catch (error) {
    console.warn("fetchStatus failed. Is the Python backend running, and is BACKEND_URL set?", error)
    throw error
  }
}
