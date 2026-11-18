export type AnalyticsEvent = "login" | "home_view" | "card_view" | "map_view" | "map_search" | "listing_view" | "filter_change" | "sort_change" | "source_open" | "beta_diagnostic"
export type EventRow = { user_id: string; event_type: AnalyticsEvent; metadata: Record<string, string> }
const allowed = new Set(["screen", "source", "category", "sort", "platform", "app_version", "app_build", "environment"])

/** Bounded, non-blocking delivery. No disk queue, email, tokens, filter values or listing addresses. */
export function createAnalytics(options: {
  enabled: boolean; identity(): string | null
  send(row: EventRow): Promise<boolean>
  context: Record<string, string>; now?: () => number
}) {
  const now = options.now ?? Date.now
  let identity: string | null = null
  const recent = new Map<string, number>()
  let pending = 0
  return {
    enabled: options.enabled,
    async track(event: AnalyticsEvent, metadata: Record<string, string> = {}): Promise<boolean> {
      const user = options.identity()
      if (identity !== user) { identity = user; recent.clear() }
      if (!options.enabled || !user || pending >= 4) return false
      const safe = Object.fromEntries(Object.entries({ ...metadata, ...options.context })
        .filter(([key, value]) => allowed.has(key) && /^[a-zA-Z0-9_. -]{1,64}$/.test(value)))
      const key = JSON.stringify([event, safe])
      const time = now()
      if (time - (recent.get(key) ?? -Infinity) < 2000) return false
      if (recent.size >= 100) recent.delete(recent.keys().next().value!)
      recent.set(key, time)
      pending++
      try { return await options.send({ user_id: user, event_type: event, metadata: safe }) }
      catch { return false }
      finally { pending-- }
    },
  }
}
