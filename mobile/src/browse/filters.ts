import { DEFAULT_FILTERS, type Filters } from "@illirent/core"

export function canonicalFilters(filters: Filters): Filters {
  return {
    ...filters,
    beds: filters.beds?.length ? [...new Set(filters.beds)].sort((a, b) => a - b) : null,
    company: filters.company?.length ? [...new Set(filters.company)].sort() : null,
  }
}
export function activeFilterCount(filters: Filters): number {
  return [!!filters.beds?.length, filters.min_price_per_bed != null || filters.max_price_per_bed != null,
    !!filters.property_type || !!filters.penthouse, !!filters.availability_window, !!filters.company?.length].filter(Boolean).length
}
export interface FilterDraft { filters: Filters; minimum: string; maximum: string; tolerance: string }
export function createFilterDraft(filters: Filters = DEFAULT_FILTERS): FilterDraft {
  return { filters: { ...filters, beds: filters.beds ? [...filters.beds] : null, company: filters.company ? [...filters.company] : null }, minimum: filters.min_price_per_bed?.toString() ?? "", maximum: filters.max_price_per_bed?.toString() ?? "", tolerance: filters.buffer_value?.toString() ?? "" }
}
export function applyFilterDraft(draft: FilterDraft): { filters: Filters; error: null } | { filters: null; error: string } {
  const parse = (value: string) => value.trim() === "" ? null : /^\d{1,6}$/.test(value.trim()) ? Number(value) : NaN
  const minimum = parse(draft.minimum), maximum = parse(draft.maximum)
  if (Number.isNaN(minimum) || Number.isNaN(maximum)) return { filters: null, error: "Enter whole dollar amounts of zero or more, or leave the price blank." }
  if (minimum != null && maximum != null && minimum > maximum) return { filters: null, error: "Minimum price must be no greater than maximum price." }
  const bufferType = maximum == null ? null : draft.filters.buffer_type
  const bufferValue = bufferType === "percent" || bufferType === "fixed" ? parse(draft.tolerance) : null
  if ((bufferType === "percent" || bufferType === "fixed") && (bufferValue == null || Number.isNaN(bufferValue))) return { filters: null, error: "Enter a tolerance amount of zero or more." }
  return { filters: canonicalFilters({ ...draft.filters, min_price_per_bed: minimum, max_price_per_bed: maximum, buffer_type: bufferType, buffer_value: bufferValue, penthouse: draft.filters.property_type === "Apartment" ? draft.filters.penthouse : null }), error: null }
}
export function toggleSelection<T>(values: T[] | null, value: T): T[] | null {
  const next = values?.includes(value) ? values.filter(item => item !== value) : [...(values ?? []), value]
  return next.length ? next : null
}
