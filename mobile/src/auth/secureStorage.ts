/** Chunked, serialized SecureStore adapter: sessions can exceed native item limits. */
export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}
type Manifest = { version: 1; id: string; count: number }
function manifest(value: string | null): Manifest | null {
  if (value === null) return null
  const m = JSON.parse(value) as Manifest
  if (m.version !== 1 || !/^[a-zA-Z0-9-]+$/.test(m.id) || !Number.isInteger(m.count) || m.count < 1 || m.count > 128) throw new Error("Invalid saved session metadata")
  return m
}
export function createSecureStorage(store: SecureKeyValueStore, randomId: () => string) {
  let queue: Promise<unknown> = Promise.resolve()
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation)
    queue = result.catch(() => {})
    return result
  }
  const chunkKey = (key: string, m: Manifest, index: number) => `${key}.${m.id}.${index}`
  async function discard(key: string, m: Manifest | null) {
    if (m) await Promise.all(Array.from({ length: m.count }, (_, i) => store.deleteItemAsync(chunkKey(key, m, i))))
  }
  return {
    getItem: (key: string) => serialized(async () => {
      const m = manifest(await store.getItemAsync(key))
      if (!m) return null
      const chunks = await Promise.all(Array.from({ length: m.count }, (_, i) => store.getItemAsync(chunkKey(key, m, i))))
      if (chunks.some(chunk => chunk === null)) throw new Error("Saved session is incomplete. Clear the saved session and sign in again.")
      return chunks.join("")
    }),
    setItem: (key: string, value: string) => serialized(async () => {
      const chars = Array.from(value)
      const chunks: string[] = []
      for (let i = 0; i < chars.length; i += 400) chunks.push(chars.slice(i, i + 400).join(""))
      if (!chunks.length) chunks.push("")
      if (chunks.length > 128) throw new Error("Session exceeds secure storage capacity")
      const old = manifest(await store.getItemAsync(key))
      const next: Manifest = { version: 1, id: randomId(), count: chunks.length }
      try {
        for (let i = 0; i < chunks.length; i++) await store.setItemAsync(chunkKey(key, next, i), chunks[i])
        // Commit last so a failed write preserves the previously saved session.
        await store.setItemAsync(key, JSON.stringify(next))
      } catch (error) {
        await discard(key, next).catch(() => {})
        throw error
      }
      // Cleanup failure must not report a committed session as a failed write.
      await discard(key, old).catch(() => {})
    }),
    removeItem: (key: string) => serialized(async () => {
      const raw = await store.getItemAsync(key)
      // Remove the pointer first, even when metadata is corrupt.
      await store.deleteItemAsync(key)
      let m: Manifest | null = null
      try { m = manifest(raw) } catch { return }
      await discard(key, m)
    }),
  }
}
