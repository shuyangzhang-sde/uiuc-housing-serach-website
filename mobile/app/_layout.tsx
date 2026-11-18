import { AppFonts } from "../src/components/AppFonts"
import { Sentry } from "../src/telemetry/crashes"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { Text } from "react-native"
import { AuthProvider, useAuth } from "../src/auth/AuthProvider"
import { Button, ErrorText, MessageScreen, Screen, styles } from "../src/components/ui"
import { useState, useEffect } from "react"

function Routes() {
  const { status, session, error, store, clearSession } = useAuth()
  const [clearError, setClearError] = useState<string | null>(null)
  if (status === "restoring") return <MessageScreen title="Welcome back" message="Restoring your session…" loading />
  if (status === "error") return <Screen><Text style={styles.title}>Let’s reconnect</Text><ErrorText message={clearError ?? error} /><Button label="Retry" onPress={() => { void store.restore() }} /><Button secondary label="Clear saved session" onPress={() => { void clearSession().catch(() => setClearError("Could not clear device storage. Please retry.")) }} /></Screen>
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!!session}><Stack.Screen name="(app)" /></Stack.Protected>
    <Stack.Protected guard={!session}><Stack.Screen name="sign-in" /></Stack.Protected>
  </Stack>
}
function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark" /><AppFonts><AuthProvider><Routes /></AuthProvider></AppFonts></SafeAreaProvider>
}

export default Sentry.wrap(RootLayout)
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return <SafeAreaProvider><Screen><Text style={styles.title}>Something went wrong</Text><Text style={styles.body}>Please close and reopen the app if this continues.</Text><Button label="Try again" onPress={retry} /></Screen></SafeAreaProvider>
}
