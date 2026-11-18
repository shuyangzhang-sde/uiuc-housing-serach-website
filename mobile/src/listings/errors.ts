import { ApiError } from "@illirent/api-client"

export function listingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session expired. Please sign in again."
    if (error.kind === "timeout") return "The listing service took too long to respond. You’re still signed in. Please try again."
    if (error.kind === "network") return "You’re signed in, but we couldn’t reach the listing service. Please try again shortly."
    if (error.kind === "invalid-response") return "The listing service returned an unexpected response. You’re still signed in. Please try again."
    if (error.status === 429) return "The listing service is busy. Please wait a moment and try again."
  }
  return "The listing service is temporarily unavailable. You’re still signed in. Please try again shortly."
}
