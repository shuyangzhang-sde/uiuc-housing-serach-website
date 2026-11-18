import { useImperativeHandle, useRef, useState, type Ref } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useQuery } from "@tanstack/react-query"
import { useFilters } from "@illirent/search-state"
import { DEFAULT_FILTERS, SORT_OPTIONS } from "@illirent/core"
import { useAuth } from "../auth/AuthProvider"
import { palette } from "../components/ui"
import { AppHeader } from "../components/AppHeader"
import { typography, fontFamilies } from "../components/typography"
import { useBrowse } from "./BrowseProvider"
import { activeFilterCount } from "./filters"
import { FilterDropdown, FILTER_CATEGORIES, filterLabel, isFilterActive, type FilterCategory } from "./FilterDropdown"
import type { DropdownAnchor } from "./Dropdown"
import { SortDropdown } from "./SortDropdown"
import { statusQueryOptions } from "./queries"

export interface SearchHeaderRef { openFilters(): void }
export function SearchHeader({ count, pending, countLabel, showSort = true, ref }: {
  count?: number; pending: boolean; countLabel?: string; showSort?: boolean; ref?: Ref<SearchHeaderRef>
}) {
  const { api, analytics } = useAuth()
  const { filters, setFilters } = useFilters()
  const { sort, setSort } = useBrowse()
  const status = useQuery(statusQueryOptions(api))
  const [dropdown, setDropdown] = useState<{ category: FilterCategory | "sort"; anchor: DropdownAnchor } | null>(null)
  const triggers = useRef<Partial<Record<FilterCategory | "sort", View | null>>>({})
  const active = activeFilterCount(filters)
  const freshness = status.data?.freshness
  const checkedAt = freshness?.last_successful_check_at ?? status.data?.last_scraped_at
  function openDropdown(category: FilterCategory | "sort") {
    triggers.current[category]?.measureInWindow((x, y, width, height) => setDropdown({ category, anchor: { x, y, width, height } }))
  }
  function renderFilter(item: typeof FILTER_CATEGORIES[number]) {
    return <View key={item.key} ref={node => { triggers.current[item.key] = node }} collapsable={false}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.label} filter`} accessibilityState={{ expanded: dropdown?.category === item.key }} onPress={() => openDropdown(item.key)} style={[headerStyles.control, isFilterActive(item.key, filters) && headerStyles.activeControl]}>
        <Text numberOfLines={1} style={[headerStyles.actionText, { maxWidth: 145 }, isFilterActive(item.key, filters) && { color: palette.background }]}>{filterLabel(item.key, filters)} ▾</Text>
      </Pressable>
    </View>
  }
  useImperativeHandle(ref, () => ({ openFilters: () => openDropdown("beds") }))
  return <>
    <View style={headerStyles.header}>
      <AppHeader caption={checkedAt ? `Checked ${new Date(checkedAt).toLocaleDateString()}` : status.isPending ? "Checking updates…" : "Last update unavailable"} />
      <View style={headerStyles.toolbar}>
        {FILTER_CATEGORIES.filter(item => item.key !== "managers").map(renderFilter)}
      </View>
      <View style={headerStyles.toolbar}>
        {renderFilter(FILTER_CATEGORIES.find(item => item.key === "managers")!)}
        {showSort && <View ref={node => { triggers.current.sort = node }} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel="Sort listings" accessibilityState={{ expanded: dropdown?.category === "sort" }} onPress={() => openDropdown("sort")} style={headerStyles.control}><Text style={headerStyles.actionText}>Sort: {SORT_OPTIONS.find(option => option.key === sort)?.short} ▾</Text></Pressable></View>}
        {active > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear all filters" onPress={() => setFilters({ ...DEFAULT_FILTERS })} style={headerStyles.clear}><Text style={headerStyles.actionText}>Clear</Text></Pressable>}
        <View style={headerStyles.countSlot}><Text accessibilityLiveRegion="polite" style={headerStyles.count}>{countLabel ?? (count == null ? pending ? "Loading listings…" : "Listings unavailable" : `${count.toLocaleString()} listings`)}</Text></View>
      </View>
      {(freshness?.state === "stale" || freshness?.state === "critical") && <Text style={headerStyles.freshness}>Data may be out of date.</Text>}
    </View>
    {dropdown && (dropdown.category === "sort" ? <SortDropdown anchor={dropdown.anchor} value={sort} onClose={() => setDropdown(null)} onChange={value => { setSort(value); void analytics.track("sort_change", { sort: value }) }} /> : <FilterDropdown key={dropdown.category} category={dropdown.category} anchor={dropdown.anchor} filters={filters} onChange={value => { setFilters(value); void analytics.track("filter_change", { category: dropdown.category }) }} onClose={() => setDropdown(null)} />)}
  </>
}
const headerStyles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 8, width: "100%", maxWidth: 1120, alignSelf: "center" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  control: { paddingVertical: 8, paddingHorizontal: 9, borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, minHeight: 44, justifyContent: "center" },
  activeControl: { backgroundColor: palette.ink, borderColor: palette.ink },
  actionText: { color: palette.ink, ...typography.control },
  countSlot: { minHeight: 44, marginLeft: "auto", maxWidth: "100%", justifyContent: "center" },
  clear: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  count: { color: palette.ink, ...typography.caption, fontFamily: fontFamilies.medium, textAlign: "right" },
  freshness: { color: palette.muted, ...typography.caption },
})
