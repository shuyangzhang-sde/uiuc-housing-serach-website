export interface Listing {
  company: string
  address: string
  unit_type: string
  beds: number | null
  price_per_bed_low: number | null
  price_per_bed_high: number | null
  price_total_low: number | null
  price_total_high: number | null
  price_note: string               // e.g. Bankier: prices can't be scraped; note replaces price in all views
  availability: string
  is_available: boolean          // Phase 6: pre-computed in ingest.py
  area: string
  url: string
  lat: number | null             // Phase 7: geocoded coordinates
  lng: number | null
  photo_url: string              // Phase 8: exterior photo from /building-list/
  availability_summary: string   // Phase 8: property-level note e.g. "Available August 2026"
  tagline: string                // Phase 8: marketing tagline e.g. "LUXURY 1 BR! HUGE!"
  description: string            // Phase 8.2: full property description from detail page
  amenities: string              // Phase 8.2: comma-separated amenity tags
  lease_dates: string            // Phase 8.2: e.g. "Aug 21, 2026 – Jul 31, 2027"
  utility_fees: string           // Phase 8.2: e.g. "$55/bed includes water, internet, trash"
  brochure_url: string           // Phase 8.2: PDF brochure link, empty when absent
  property_type: string          // Phase 8.3: e.g. "Apartment", "House", "Townhouse"
}

// Shared listing filters used by Card and Map.
export interface Filters {
  beds: number[] | null
  availability_window:
    | "now"
    | "june_2026"
    | "july_2026"
    | "august_2026"
    | "january_2027"
    | "august_2027"
    | "leased"
    | null
  min_price_per_bed: number | null                    // floor
  max_price_per_bed: number | null                    // ceiling; the buffer below widens THIS end only
  company: string[] | null                            // multi-select: null or [] means every source
  buffer_type: "percent" | "fixed" | "exact" | null  // how the price buffer is applied
  buffer_value: number | null                         // % or $ amount; null when type is "exact"
  property_type: string | null                        // "Apartment" | "House" | "Townhouse"
  penthouse: boolean | null                           // sub-filter under Apartment
}

export const DEFAULT_FILTERS: Filters = {
  beds: null,
  availability_window: null,
  min_price_per_bed: null,
  max_price_per_bed: null,
  company: null,
  // Null until the user actually picks a tolerance. Both query paths read null as
  // "exact", so an untouched Max tolerance never silently widens the ceiling.
  buffer_type: null,
  buffer_value: null,
  property_type: null,
  penthouse: null,
}

export interface DataStatus {
  last_scraped: string | null
  last_scraped_at: string | null
  listing_count: number | null
  property_count: number | null
  freshness?: {
    state: "fresh" | "stale" | "critical" | "unknown"
    last_successful_check_at: string | null
    age_hours: number | null
    stale_sources: string[]
  }
}


export type ListingSort = "beds" | "price_asc" | "price_desc" | "company"

export interface ListingsPage {
  listings: Listing[]
  total: number
}
