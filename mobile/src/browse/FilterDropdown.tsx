import { useState } from "react"
import { Text, View } from "react-native"
import { AVAIL_OPTIONS, BED_OPTIONS, COMPANIES, PROPERTY_TYPE_OPTIONS, UNSCRAPABLE_COMPANIES, FULLY_LEASED_COMPANIES, type Filters } from "@illirent/core"
import { Button, ErrorText, Field, styles } from "../components/ui"
import { applyFilterDraft, createFilterDraft, toggleSelection } from "./filters"
import { Dropdown, DropdownChoice, type DropdownAnchor } from "./Dropdown"

export type FilterCategory = "beds" | "budget" | "type" | "availability" | "managers"
export const FILTER_CATEGORIES: { key: FilterCategory; label: string }[] = [
  { key: "beds", label: "Beds" }, { key: "budget", label: "Budget / bed" },
  { key: "type", label: "Property type" }, { key: "availability", label: "Availability" }, { key: "managers", label: "Managers" },
]
export function filterLabel(category: FilterCategory, filters: Filters): string {
  if (category === "beds") {
    if (!filters.beds?.length) return "Beds"
    if (filters.beds.length === 1 && filters.beds[0] === 0) return "Studio"
    return filters.beds.map(bed => bed === 0 ? "Studio" : bed === 5 ? "5+" : String(bed)).join(", ") + (filters.beds.length === 1 && filters.beds[0] === 1 ? " bed" : " beds")
  }
  if (category === "budget") {
    const min = filters.min_price_per_bed, max = filters.max_price_per_bed
    if (min != null && max != null) return `$${min}–$${max}/bed`
    if (max != null) return `≤ $${max}/bed`
    if (min != null) return `≥ $${min}/bed`
    return "Budget/bed"
  }
  if (category === "type") return filters.penthouse ? "Penthouse" : filters.property_type ?? "Type"
  if (category === "availability") return AVAIL_OPTIONS.find(option => option.value === filters.availability_window && option.value != null)?.label ?? "Availability"
  return filters.company?.length ? `Managers · ${filters.company.length}` : "Managers"
}
export function isFilterActive(category: FilterCategory, filters: Filters): boolean {
  return category === "beds" ? !!filters.beds?.length : category === "budget" ? filters.min_price_per_bed != null || filters.max_price_per_bed != null : category === "type" ? !!filters.property_type || !!filters.penthouse : category === "availability" ? !!filters.availability_window : !!filters.company?.length
}
export function FilterDropdown({ category, anchor, filters, onChange, onClose }: {
  category: FilterCategory; anchor: DropdownAnchor; filters: Filters; onChange: (filters: Filters) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(() => createFilterDraft(filters))
  const [error, setError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState(false)
  const patch = (value: Partial<Filters>, close = false) => { onChange({ ...filters, ...value }); if (close) onClose() }
  const multi = category === "beds" || category === "managers"
  const budget = category === "budget"
  const title = budget ? "Monthly budget per bed" : FILTER_CATEGORIES.find(item => item.key === category)!.label
  function applyBudget() {
    // Preserve any other applied categories; only the budget draft is committed here.
    const result = applyFilterDraft({ ...draft, filters: { ...filters, buffer_type: draft.filters.buffer_type } })
    setError(result.error)
    if (result.filters) { onChange(result.filters); onClose() }
  }
  return <Dropdown anchor={anchor} title={title} onClose={onClose} footer={budget ? <><ErrorText message={error} /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button secondary label="Clear" onPress={() => { patch({ min_price_per_bed: null, max_price_per_bed: null, buffer_type: null, buffer_value: null }, true) }} /></View><View style={{ flex: 1 }}><Button label="Apply" onPress={applyBudget} /></View></View></> : multi ? <Button label="Done" onPress={onClose} /> : undefined}>
    {category === "beds" && BED_OPTIONS.map(option => <DropdownChoice key={String(option.value)} group="Beds" label={option.label} multiple selected={option.value === null ? !filters.beds?.length : !!filters.beds?.includes(option.value)} onPress={() => patch({ beds: option.value === null ? null : toggleSelection(filters.beds, option.value) })} />)}
    {budget && <View style={{ gap: 12, padding: 6 }}>
      <Field label="Minimum price ($ per bed)" keyboardType="number-pad" value={draft.minimum} onChangeText={minimum => setDraft(value => ({ ...value, minimum }))} placeholder="No minimum" maxLength={6} />
      <Field label="Maximum price ($ per bed)" keyboardType="number-pad" value={draft.maximum} onChangeText={maximum => setDraft(value => ({ ...value, maximum }))} placeholder="No maximum" maxLength={6} />
      {draft.maximum.trim() !== "" && <>
        <Text style={styles.label}>Max tolerance</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>{([['exact', 'Exact'], ['percent', '+%'], ['fixed', '+$']] as const).map(([type, label]) => <View key={type} style={{ flex: 1 }}><Button secondary={(draft.filters.buffer_type ?? "exact") !== type} label={label} onPress={() => setDraft(value => ({ ...value, filters: { ...value.filters, buffer_type: type }, tolerance: type === "percent" ? "15" : type === "fixed" ? "50" : "" }))} /></View>)}</View>
        {(draft.filters.buffer_type === "percent" || draft.filters.buffer_type === "fixed") && <Field label={draft.filters.buffer_type === "percent" ? "Tolerance (%)" : "Tolerance ($)"} keyboardType="number-pad" value={draft.tolerance} onChangeText={tolerance => setDraft(value => ({ ...value, tolerance }))} maxLength={6} />}
      </>}
    </View>}
    {category === "type" && <>{PROPERTY_TYPE_OPTIONS.map(option => <DropdownChoice key={String(option.value)} group="Property type" label={option.label} selected={filters.property_type === option.value && !filters.penthouse} onPress={() => patch({ property_type: option.value, penthouse: null }, true)} />)}<DropdownChoice group="Property type" label="Penthouse" selected={!!filters.penthouse} onPress={() => patch({ property_type: "Apartment", penthouse: true }, true)} /></>}
    {category === "availability" && AVAIL_OPTIONS.map(option => <DropdownChoice key={String(option.value)} group="Availability" label={option.label} selected={filters.availability_window === option.value} onPress={() => patch({ availability_window: option.value }, true)} />)}
    {category === "managers" && <><DropdownChoice group="Company" label="All managers" selected={!filters.company?.length} onPress={() => patch({ company: null })} />{COMPANIES.map(company => <DropdownChoice key={company.name} group="Company" label={company.name} multiple selected={!!filters.company?.includes(company.name)} onPress={() => patch({ company: toggleSelection(filters.company, company.name) })} />)}<Button secondary label={coverage ? "Hide source coverage" : "About source coverage"} onPress={() => setCoverage(value => !value)} />{coverage && [...UNSCRAPABLE_COMPANIES, ...FULLY_LEASED_COMPANIES].map(company => <Text key={company.name} style={styles.body}>{company.name}: {company.reason}</Text>)}</>}
  </Dropdown>
}
