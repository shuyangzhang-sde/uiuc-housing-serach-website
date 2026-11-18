export interface MobileEnvironment {
  supabaseUrl: string
  supabaseKey: string
  apiUrl: string
}
export function validateEnvironment(values: Partial<MobileEnvironment>, development: boolean): MobileEnvironment {
  const { supabaseUrl, supabaseKey, apiUrl } = values
  if (!supabaseUrl || !supabaseKey || !apiUrl) throw new Error("Add the three public connection settings in mobile/.env.local, then restart Expo.")
  const auth = new URL(supabaseUrl)
  const api = new URL(apiUrl)
  if (auth.protocol !== "https:" || !["https:", ...(development ? ["http:"] : [])].includes(api.protocol)) throw new Error("Supabase requires HTTPS. Release builds also require an HTTPS backend.")
  if ([auth, api].some(url => url.username || url.password || url.search || url.hash || url.pathname !== "/")) throw new Error("Use service origins without credentials, paths, query strings, or fragments.")
  if (supabaseKey.startsWith("sb_secret_")) throw new Error("Use a Supabase publishable or anon key, never a secret key.")
  if (!supabaseKey.startsWith("sb_publishable_")) {
    try {
      const payload = supabaseKey.split(".")[1]
      const role = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role
      if (role !== "anon") throw new Error("Invalid public key role")
    } catch { throw new Error("Use a valid Supabase publishable or legacy anon key.") }
  }
  return { supabaseUrl: auth.origin, supabaseKey, apiUrl: api.origin }
}
export function readEnvironment(): MobileEnvironment {
  // Expo inlines only direct EXPO_PUBLIC_* accesses.
  return validateEnvironment({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  }, __DEV__)
}
