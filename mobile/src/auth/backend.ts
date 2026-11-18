import { ApiError, createApiClient } from "@illirent/api-client"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Retry a rejected read once after one shared refresh; never loop on 401. */
export function createAuthenticatedApi(apiUrl: string, auth: SupabaseClient["auth"], expire: () => Promise<void>, fetch?: typeof globalThis.fetch) {
  let refresh: Promise<string | null> | null = null
  let expiration: Promise<void> | null = null
  const client = createApiClient({ baseUrl: apiUrl, fetch, getAccessToken: async () => {
    const { data, error } = await auth.getSession()
    if (error || !data.session) throw new ApiError("Sign in to load listings", "http", 401)
    return data.session.access_token
  } })
  async function withSession<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation() } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      refresh ??= auth.refreshSession().then(({ data, error }) => {
        if (error) throw error
        return data.session?.access_token ?? null
      }).finally(() => { refresh = null })
      let token: string | null
      try { token = await refresh } catch (refreshError) {
        // Connectivity failures should preserve the saved session for a later retry.
        if (refreshError && typeof refreshError === "object" && "name" in refreshError && refreshError.name === "AuthRetryableFetchError") throw new ApiError("Could not refresh session. Check your connection.", "network")
        token = null
      }
      if (token) {
        try { return await operation() } catch (retryError) {
          if (!(retryError instanceof ApiError) || retryError.status !== 401) throw retryError
        }
      }
      expiration ??= expire().finally(() => { expiration = null })
      await expiration
      throw new ApiError("Your session expired. Please sign in again.", "http", 401)
    }
  }
  return {
    fetchStatus: client.fetchStatus,
    fetchAllListings: (...args: Parameters<typeof client.fetchAllListings>) => withSession(() => client.fetchAllListings(...args)),
    fetchListingsPage: (...args: Parameters<typeof client.fetchListingsPage>) => withSession(() => client.fetchListingsPage(...args)),
  }
}
