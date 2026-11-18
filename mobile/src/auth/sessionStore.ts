import type { Session, SupabaseClient } from "@supabase/supabase-js"

type Auth = SupabaseClient["auth"]
export type SessionState = { status: "restoring" | "ready" | "error"; session: Session | null; error: string | null }
export interface AppLifecycle {
  currentState: string | null
  addEventListener(event: "change", callback: (state: string) => void): { remove(): void }
}
export function createSessionStore(auth: Auth, lifecycle: AppLifecycle) {
  let state: SessionState = { status: "restoring", session: null, error: null }
  let revision = 0
  let stopped = false
  const listeners = new Set<() => void>()
  function publish(next: SessionState) {
    if (stopped) return
    state = next
    listeners.forEach(listener => listener())
  }
  async function restore() {
    const version = ++revision
    publish({ status: "restoring", session: null, error: null })
    try {
      const { data, error } = await auth.getSession()
      if (error) throw error
      if (version === revision) publish({ status: "ready", session: data.session, error: null })
    } catch {
      if (version === revision) publish({ status: "error", session: null, error: "Could not restore your session. Check your connection and retry, or clear the saved session." })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    restore,
    fail(error: string) { ++revision; publish({ status: "error", session: null, error }) },
    clear() { ++revision; publish({ status: "ready", session: null, error: null }) },
    start() {
      stopped = false
      const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION") return
        // Synchronous state publication only: no auth calls from inside this callback.
        ++revision
        publish({ status: "ready", session, error: null })
      })
      const refresh = (appState: string) => {
        if (appState === "active") auth.startAutoRefresh()
        else auth.stopAutoRefresh()
      }
      const appSubscription = lifecycle.addEventListener("change", refresh)
      void restore()
      refresh(lifecycle.currentState ?? "background")
      return () => { stopped = true; ++revision; subscription.unsubscribe(); appSubscription.remove(); auth.stopAutoRefresh() }
    },
  }
}
