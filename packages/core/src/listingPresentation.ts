import type { Listing, ListingSort } from "./types"

export const SORT_OPTIONS: { key: ListingSort; label: string; short: string }[] = [
  { key: "beds", label: "Beds", short: "Beds" },
  { key: "price_asc", label: "Price: low to high", short: "Price ↑" },
  { key: "price_desc", label: "Price: high to low", short: "Price ↓" },
  { key: "company", label: "Property manager", short: "Manager" },
]
export const DEFAULT_SORT: ListingSort = "beds"

export function priceRangeText(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null) return "—"
  if (high == null || low === high) return `$${low.toLocaleString()}`
  return `$${low.toLocaleString()}–$${high.toLocaleString()}`
}

/** Keep source-specific price notes and never label a per-bed price as a total. */
export function listingPrice(listing: Listing): { text: string; caption: string } {
  if (listing.price_note) return { text: listing.price_note, caption: "Pricing note" }
  if (listing.beds != null && listing.beds <= 1 && listing.price_total_low != null) {
    return { text: priceRangeText(listing.price_total_low, listing.price_total_high), caption: "total / month" }
  }
  if (listing.price_per_bed_low != null) return { text: priceRangeText(listing.price_per_bed_low, listing.price_per_bed_high), caption: "per bed / month" }
  if (listing.price_total_low != null) return { text: priceRangeText(listing.price_total_low, listing.price_total_high), caption: "total / month" }
  return { text: "Ask for pricing", caption: "Price not published" }
}

export function httpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
