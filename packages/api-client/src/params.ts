import type { Filters } from "@illirent/core"

export function buildListingParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.beds?.length)              filters.beds.forEach(b => params.append("beds", String(b)))
  if (filters.company?.length)           filters.company.forEach(c => params.append("company", c))
  if (filters.min_price_per_bed != null) params.set("min_price_per_bed", String(filters.min_price_per_bed))
  if (filters.max_price_per_bed != null) params.set("max_price_per_bed", String(filters.max_price_per_bed))
  if (filters.buffer_type)               params.set("buffer_type", filters.buffer_type)
  if (filters.buffer_value != null)      params.set("buffer_value", String(filters.buffer_value))
  if (filters.availability_window)       params.set("availability_window", filters.availability_window)
  if (filters.property_type)             params.set("property_type", filters.property_type)
  if (filters.penthouse != null)         params.set("penthouse", String(filters.penthouse))
  return params
}
