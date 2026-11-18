import { useScreenAnalytics } from "../../../src/telemetry/useScreenAnalytics"
import { useEffect, useMemo, useRef } from "react"
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { useFilters } from "@illirent/search-state"
import { DEFAULT_FILTERS, type Listing, type ListingsPage } from "@illirent/core"
import { useAuth } from "../../../src/auth/AuthProvider"
import { Button, ErrorText, AppBackground, palette, styles } from "../../../src/components/ui"
import { useBrowse } from "../../../src/browse/BrowseProvider"
import { SearchHeader, type SearchHeaderRef } from "../../../src/browse/SearchHeader"
import { ListingCard } from "../../../src/browse/ListingCard"
import { listingQueryOptions } from "../../../src/browse/queries"
import { listingErrorMessage } from "../../../src/listings/errors"
import { typography } from "../../../src/components/typography"

export default function BrowseScreen() {
  useScreenAnalytics("card_view")
  const { session, api } = useAuth()
  const { filters, setFilters } = useFilters()
  const { sort, select } = useBrowse()
  const router = useRouter()
  const queryClient = useQueryClient()
  const list = useRef<FlatList<Listing>>(null)
  const header = useRef<SearchHeaderRef>(null)
  const columns = useWindowDimensions().width >= 760 ? 2 : 1
  const options = listingQueryOptions(api, session?.user.id ?? "", filters, sort)
  const query = useInfiniteQuery(options)
  const entries = useMemo(() => query.data?.pages.flatMap(page => page.listings) ?? [], [query.data])
  const total = query.data?.pages[0]?.total
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }) }, [filters, sort])
  function loadMore() {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage({ cancelRefetch: false })
  }
  function refresh() {
    queryClient.setQueryData<InfiniteData<ListingsPage, number>>(options.queryKey, old => old ? { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) } : old)
    void query.refetch()
    void queryClient.invalidateQueries({ queryKey: ["data-status"] })
  }
  function openProperty(listing: Listing) { select(listing); router.push({ pathname: "/property", params: { from: "browse" } }) }
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}><AppBackground />
    <SearchHeader ref={header} count={total} pending={query.isPending} />
    <FlatList
      key={`columns-${columns}`} ref={list} data={entries} numColumns={columns}
      style={{ flex: 1 }} contentContainerStyle={browse.list}
      columnWrapperStyle={columns === 2 ? { gap: 16 } : undefined}
      keyExtractor={(listing, index) => `${listing.company}:${listing.url}:${listing.unit_type}:${index}`}
      renderItem={({ item }) => <ListingCard listing={item} onPress={() => openProperty(item)} style={columns === 2 ? { maxWidth: "50%" } : undefined} />}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      initialNumToRender={6} maxToRenderPerBatch={8} windowSize={7}
      refreshControl={<RefreshControl tintColor={palette.green} colors={[palette.green]} refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={refresh} />}
      onEndReached={() => { if (!query.isFetchNextPageError) loadMore() }} onEndReachedThreshold={0.4}
      ListEmptyComponent={<View style={browse.empty}>{query.isPending ? <><ActivityIndicator color={palette.green} accessibilityLabel="Loading listings" /><Text style={styles.body}>Finding homes around campus…</Text></> : query.isError ? <><ErrorText message={listingErrorMessage(query.error)} /><Button label="Retry loading listings" onPress={refresh} /></> : <><Text accessibilityRole="header" style={browse.emptyTitle}>No homes match just yet</Text><Text style={styles.body}>Try a wider budget or fewer filters.</Text><Button label="Clear filters" onPress={() => setFilters({ ...DEFAULT_FILTERS })} /><Button secondary label="Edit filters" onPress={() => header.current?.openFilters()} /></>}</View>}
      ListFooterComponent={entries.length ? <View style={browse.footer}>
        {query.isError && <ErrorText message={listingErrorMessage(query.error)} />}
        {query.isFetchingNextPage && <ActivityIndicator accessibilityLabel="Loading more listings" color={palette.green} />}
        {query.hasNextPage ? <Button secondary label={query.isFetchNextPageError ? "Retry loading more" : "Load more listings"} disabled={query.isFetching} onPress={loadMore} /> : <Text style={browse.freshness}>You’ve reached the end · {entries.length.toLocaleString()} shown</Text>}
        {query.isRefetchError && <Button secondary label="Retry refresh" onPress={refresh} />}
      </View> : null}
    />
  </SafeAreaView>
}
const browse = StyleSheet.create({
  freshness: { color: palette.muted, ...typography.caption },
  list: { padding: 16, paddingTop: 0, flexGrow: 1, width: "100%", maxWidth: 1120, alignSelf: "center" },
  empty: { flex: 1, justifyContent: "center", paddingVertical: 40, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  emptyTitle: { color: palette.ink, ...typography.emptyTitle },
  footer: { gap: 16, paddingVertical: 24 },
})
