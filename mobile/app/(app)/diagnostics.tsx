import { useState } from "react"
import { Text } from "react-native"
import { useRouter } from "expo-router"
import * as Application from "expo-application"
import { useAuth } from "../../src/auth/AuthProvider"
import { crashReportingEnabled, Sentry } from "../../src/telemetry/crashes"
import { Button, Screen, styles } from "../../src/components/ui"

export default function Diagnostics() {
  const router = useRouter()
  const { analytics, api } = useAuth()
  const [result, setResult] = useState("")
  const [busy, setBusy] = useState(false)
  async function check() {
    setBusy(true)
    try { await api.fetchStatus(); setResult("Backend reachable.") }
    catch { setResult("Backend unavailable. Check your connection and retry.") }
    finally { setBusy(false) }
  }
  if (!__DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== "preview") return <Screen><Button label="Back" onPress={() => router.back()} /></Screen>
  return <Screen>
    <Text accessibilityRole="header" style={styles.title}>Beta diagnostics</Text>
    <Text style={styles.body}>Version {Application.nativeApplicationVersion} ({Application.nativeBuildVersion}) · {process.env.EXPO_PUBLIC_APP_ENV ?? "development"}</Text>
    <Text style={styles.body}>Analytics: {analytics.enabled ? "enabled" : "disabled"}. Crash reporting: {crashReportingEnabled ? "enabled" : "disabled"}.</Text>
    <Text style={styles.body}>Development builds do not send telemetry. Beta tests below send diagnostics only when configured.</Text>
    <Button label={busy ? "Checking…" : "Check backend"} disabled={busy} onPress={() => { void check() }} />
    <Button secondary label="Send test analytics event" disabled={!analytics.enabled} onPress={() => { void analytics.track("beta_diagnostic").then(ok => setResult(ok ? "Analytics event accepted. Verify it in the dashboard." : "Event was not stored. Check configuration/network or try a non-admin account after a few seconds.")) }} />
    <Button secondary label="Send test error" disabled={!crashReportingEnabled} onPress={() => {
      Sentry.captureException(new Error("Beta diagnostic"), { tags: { diagnostic: "true" } })
      void Sentry.flush().then(ok => setResult(ok ? "Crash queue flushed. Verify the diagnostic in Sentry." : "Could not flush. Check the network and Sentry configuration."))
    }} />
    <Text accessibilityLiveRegion="polite" style={styles.body}>{result}</Text>
    <Button secondary label="Back" onPress={() => router.back()} />
  </Screen>
}
