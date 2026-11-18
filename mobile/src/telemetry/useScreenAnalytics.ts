import { useCallback } from "react"
import { useFocusEffect } from "expo-router"
import { useAuth } from "../auth/AuthProvider"
import type { AnalyticsEvent } from "./analytics"

export function useScreenAnalytics(event: AnalyticsEvent) {
  const { analytics } = useAuth()
  useFocusEffect(useCallback(() => { void analytics.track(event) }, [analytics, event]))
}
