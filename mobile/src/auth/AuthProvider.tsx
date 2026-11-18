import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react"
import { readEnvironment } from "../config/environment"
import { createAuthRuntime, type AuthRuntime } from "./runtime"
import { MessageScreen } from "../components/ui"

const AuthContext = createContext<AuthRuntime | null>(null)
export function AuthProvider({ children }: PropsWithChildren) {
  const [initial] = useState(() => {
    try { return { runtime: createAuthRuntime(readEnvironment()), error: null } }
    catch (error) { return { runtime: null, error: error instanceof Error ? error.message : "Check mobile connection settings." } }
  })
  useEffect(() => initial.runtime?.store.start(), [initial])
  if (!initial.runtime) return <MessageScreen title="Connect IlliniRent" message={initial.error ?? "Check the app configuration."} />
  return <AuthContext.Provider value={initial.runtime}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error("useAuth requires AuthProvider")
  const state = useSyncExternalStore(auth.store.subscribe, auth.store.getSnapshot, auth.store.getSnapshot)
  return { ...auth, ...state }
}
