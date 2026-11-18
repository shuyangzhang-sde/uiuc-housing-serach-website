import { useScreenAnalytics } from "../../../src/telemetry/useScreenAnalytics"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect, useRouter } from "expo-router"
import { useQuery } from "@tanstack/react-query"
import { useFilters } from "@illirent/search-state"
import { DEFAULT_FILTERS, bedsLabel, listingPrice, type Listing } from "@illirent/core"
import { useAuth } from "../../../src/auth/AuthProvider"
import { useBrowse } from "../../../src/browse/BrowseProvider"
import { SearchHeader, type SearchHeaderRef } from "../../../src/browse/SearchHeader"
import { activeFilterCount, canonicalFilters } from "../../../src/browse/filters"
import { Button, ErrorText, AppBackground, palette, styles } from "../../../src/components/ui"
import { typography, fontFamilies } from "../../../src/components/typography"
import { HousingMap } from "../../../src/map/HousingMap"
import { buildMapData } from "../../../src/map/data"
import { mapQueryOptions } from "../../../src/map/queries"
import { listingErrorMessage } from "../../../src/listings/errors"

export default function MapScreen() {
  useScreenAnalytics("map_view")
  const { session, api, analytics } = useAuth()
  const { filters, setFilters } = useFilters()
  const { select } = useBrowse()
  const router = useRouter()
  const header = useRef<SearchHeaderRef>(null)
  const query = useQuery(mapQueryOptions(api, session?.user.id ?? "", filters))
  const data = useMemo(() => buildMapData(query.data ?? []), [query.data])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const searchKey = JSON.stringify(canonicalFilters(filters))
  useEffect(() => { if (query.isSuccess) void analytics.track("map_search") }, [analytics, query.isSuccess, searchKey])
  useEffect(() => { setSelectedId(null) }, [searchKey])
  const selected = selectedId ? data.locations.get(selectedId) : null
  useFocusEffect(useCallback(() => {
    if (!selectedId) return
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { setSelectedId(null); return true })
    return () => subscription.remove()
  }, [selectedId]))
  const [optionsOpen, setOptionsOpen] = useState(false)
  useEffect(() => { setOptionsOpen(false) }, [selectedId])
  function openProperty(listing: Listing) { select(listing); router.push({ pathname: "/property", params: { from: "map" } }) }
  const allOptions = optionsOpen && selected ? selected.listings : selected?.listings.slice(0, 1) ?? []
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}><AppBackground />
    <SearchHeader ref={header} pending={query.isPending} showSort={false} count={query.data?.length} />
    <View style={mapScreen.mapArea}>
      <HousingMap data={data} searchKey={searchKey} loading={query.isPending} fitOnSearch={activeFilterCount(filters) > 0} selectedId={selectedId} onSelect={setSelectedId} />
      {query.isError && <View style={mapScreen.message}><ErrorText message={listingErrorMessage(query.error)} /><Button label="Retry listings" onPress={() => { void query.refetch() }} /></View>}
      {!query.isPending && !query.isError && data.groups.length === 0 && <View style={mapScreen.message}>
        <Text style={styles.body}>{query.data?.length ? "These listings don’t have map locations yet. They’re still available in Browse." : "No listings match these filters."}</Text>
        <Button label="View in Browse" onPress={() => router.navigate("/browse")} />
        <Button secondary label="Clear filters" onPress={() => setFilters({ ...DEFAULT_FILTERS })} />
      </View>}
      {query.isPending && <View pointerEvents="none" style={mapScreen.loading}><Text style={styles.body}>Loading filtered locations…</Text></View>}
    </View>
    {data.missing > 0 && <View style={mapScreen.missing}><Text style={mapScreen.caption}>{data.missing} {data.missing === 1 ? "listing has" : "listings have"} no map location. All results remain in Browse.</Text></View>}
    {selected && <View style={mapScreen.preview}>
      <View style={mapScreen.previewHeader}><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={mapScreen.address}>{selected.listings[0].address}</Text><Text style={mapScreen.caption}>{selected.listings.length} {selected.listings.length === 1 ? "listing" : "listing options"} at this location</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close map preview" onPress={() => setSelectedId(null)} style={mapScreen.close}><Text style={styles.body}>✕</Text></Pressable></View>
      <FlatList style={{ maxHeight: 150, flexGrow: 0 }} data={allOptions} keyExtractor={(listing, index) => `${listing.company}:${listing.unit_type}:${index}`} renderItem={({ item }) => {
        const price = listingPrice(item)
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open map property details: ${item.company}, ${item.unit_type}, ${price.text}`} onPress={() => openProperty(item)} style={mapScreen.unit}><View style={{ flex: 1, gap: 3 }}><Text style={mapScreen.unitTitle}>{item.company}</Text><Text style={mapScreen.caption}>{[item.unit_type, bedsLabel(item.beds, item.unit_type), item.availability].filter(Boolean).join(" · ")}</Text><Text style={mapScreen.unitTitle}>{price.text}{item.price_note ? "" : ` · ${price.caption}`}</Text></View><Text style={mapScreen.arrow}>→</Text></Pressable>
      }} />
      {selected.listings.length > 1 && <Button secondary label={optionsOpen ? "Show fewer options" : `See all ${selected.listings.length} listing options`} onPress={() => setOptionsOpen(value => !value)} />}
    </View>}
  </SafeAreaView>
}
const mapScreen = StyleSheet.create({
  mapArea: { flex: 1, minHeight: 160 },
  message: { position: "absolute", top: 52, left: 12, right: 12, backgroundColor: palette.background, borderRadius: 14, padding: 16, gap: 10 },
  loading: { position: "absolute", bottom: 24, alignSelf: "center", padding: 12, borderRadius: 14, backgroundColor: palette.background },
  missing: { paddingHorizontal: 16, paddingVertical: 6 },
  caption: { ...typography.caption, color: palette.muted },
  preview: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8, gap: 8, backgroundColor: palette.background, borderTopWidth: 1, borderTopColor: palette.line, maxHeight: 280 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: { ...typography.body, fontFamily: fontFamilies.medium, color: palette.ink },
  close: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  unit: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.line },
  unitTitle: { ...typography.control, color: palette.ink, fontFamily: fontFamilies.medium },
  arrow: { ...typography.section, color: palette.ink },
})
