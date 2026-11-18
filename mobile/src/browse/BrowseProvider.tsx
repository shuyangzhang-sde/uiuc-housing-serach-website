import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"
import { AppState } from "react-native"
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query"
import { FiltersProvider } from "@illirent/search-state"
import { DEFAULT_SORT, type Listing, type ListingSort } from "@illirent/core"

const BrowseContext = createContext<{
  sort: ListingSort; setSort: (sort: ListingSort) => void
  selected: Listing | null; select: (listing: Listing | null) => void
} | null>(null)

/** Mounted inside protected navigation, keyed by identity; nothing persists to disk. */
export function BrowseProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())
  const [sort, setSort] = useState<ListingSort>(DEFAULT_SORT)
  const [selected, select] = useState<Listing | null>(null)
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active")
    const subscription = AppState.addEventListener("change", state => focusManager.setFocused(state === "active"))
    return () => { subscription.remove(); void queryClient.cancelQueries(); queryClient.clear() }
  }, [queryClient])
  return <QueryClientProvider client={queryClient}><FiltersProvider><BrowseContext.Provider value={{ sort, setSort, selected, select }}>{children}</BrowseContext.Provider></FiltersProvider></QueryClientProvider>
}
export function useBrowse() {
  const value = useContext(BrowseContext)
  if (!value) throw new Error("useBrowse requires BrowseProvider")
  return value
}
