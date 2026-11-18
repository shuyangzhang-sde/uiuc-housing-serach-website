import type { FeatureCollection, Point } from "geojson"
import { availabilityStatus, type Listing } from "@illirent/core"

export const CAMPUS_CENTER: [number, number] = [-88.227, 40.1095]
export const CAMPUS_ZOOM = 13.5
export interface MapLocation { id: string; coordinates: [number, number]; listings: Listing[] }
export interface PinProperties { locationId: string; label: string; count: number; available: boolean }
export function validCoordinates(listing: Listing): boolean {
  return listing.lat != null && listing.lng != null && Number.isFinite(listing.lat) && Number.isFinite(listing.lng) && Math.abs(listing.lat) <= 90 && Math.abs(listing.lng) <= 180
}
/** Multiple floor plans at one location share a pin; no source listing is discarded. */
export function buildMapData(listings: Listing[]) {
  const locations = new Map<string, MapLocation>()
  let missing = 0
  for (const listing of listings) {
    if (!validCoordinates(listing)) { missing++; continue }
    const id = `${listing.lng!.toFixed(6)},${listing.lat!.toFixed(6)}`
    const existing = locations.get(id)
    if (existing) existing.listings.push(listing)
    else locations.set(id, { id, coordinates: [listing.lng!, listing.lat!], listings: [listing] })
  }
  const groups = [...locations.values()]
  const geojson: FeatureCollection<Point, PinProperties> = {
    type: "FeatureCollection", features: groups.map(group => {
      const prices = group.listings.map(listing => listing.price_note ? null : listing.price_per_bed_low ?? (listing.beds != null && listing.beds <= 1 ? listing.price_total_low : null)).filter((price): price is number => price != null && Number.isFinite(price))
      return { type: "Feature", id: group.id, geometry: { type: "Point", coordinates: group.coordinates }, properties: {
        locationId: group.id, label: prices.length ? `$${Math.min(...prices).toLocaleString("en-US")}` : "—", count: group.listings.length,
        available: group.listings.some(listing => availabilityStatus(listing.availability) !== "unavailable"),
      } }
    }),
  }
  return { groups, locations, geojson, missing, mapped: listings.length - missing }
}
export function locationBounds(groups: MapLocation[]): [number, number, number, number] | null {
  if (!groups.length) return null
  const lngs = groups.map(group => group.coordinates[0]), lats = groups.map(group => group.coordinates[1])
  let west = Math.min(...lngs), east = Math.max(...lngs), south = Math.min(...lats), north = Math.max(...lats)
  if (west === east) { west -= 0.001; east += 0.001 }
  if (south === north) { south -= 0.001; north += 0.001 }
  return [west, south, east, north]
}
