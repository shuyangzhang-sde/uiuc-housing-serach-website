import "react-native-url-polyfill/auto"
import * as Application from "expo-application"
import { createAnalytics } from "../telemetry/analytics"
import { Platform, AppState } from "react-native"
import * as SecureStore from "expo-secure-store"
import { randomUUID } from "expo-crypto"
import { createClient, processLock } from "@supabase/supabase-js"
import type { MobileEnvironment } from "../config/environment"
import { createSecureStorage } from "./secureStorage"
import { createSessionStore } from "./sessionStore"
import { createAuthenticatedApi } from "./backend"
import { createAuthFetch } from "./transport"

export function createAuthRuntime(environment: MobileEnvironment) {
  const storage = createSecureStorage({
    getItemAsync: key => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    deleteItemAsync: key => SecureStore.deleteItemAsync(key),
  }, randomUUID)
  const storageKey = `illinirent.mobile.${new URL(environment.supabaseUrl).hostname.split(".")[0]}.auth`
  const supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
    global: { fetch: createAuthFetch() },
    auth: { storage, storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock },
  })
  const store = createSessionStore(supabase.auth, AppState)
  async function clearSession() {
    try {
      await storage.removeItem(storageKey)
      await storage.removeItem(`${storageKey}-user`)
    } catch (error) {
      store.fail("Could not clear the saved session. Retry clearing device storage before signing in again.")
      throw error
    }
    store.clear()
  }
  async function signOut() {
    try {
      await supabase.auth.signOut({ scope: "local" })
    } finally { await clearSession() }
  }

  const analytics = createAnalytics({
    enabled: !__DEV__ && process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === "true",
    identity: () => store.getSnapshot().session?.user.id ?? null,
    context: { platform: Platform.OS, app_version: Application.nativeApplicationVersion ?? "unknown", app_build: Application.nativeBuildVersion ?? "unknown", environment: process.env.EXPO_PUBLIC_APP_ENV ?? "development" },
    async send(row) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user.id !== row.user_id) return false
        const response = await fetch(`${environment.apiUrl}/api/events`, {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ event_type: row.event_type, metadata: row.metadata }),
        })
        if (!response.ok) return false
        const result = await response.json()
        return result.ok === true && result.skipped !== "admin"
      } finally { clearTimeout(timeout) }
    },
  })
  return { supabase, store, analytics, clearSession, signOut, api: createAuthenticatedApi(environment.apiUrl, supabase.auth, clearSession) }
}
export type AuthRuntime = ReturnType<typeof createAuthRuntime>
