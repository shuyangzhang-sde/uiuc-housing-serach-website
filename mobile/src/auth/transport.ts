/** Bound Supabase network calls so offline auth/logout cannot hang indefinitely. */
export function createAuthFetch(fetchImpl: typeof fetch = globalThis.fetch, timeoutMs = 10000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const signal = init?.signal
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener("abort", abort, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try { return await fetchImpl(input, { ...init, signal: controller.signal }) }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort) }
  }
}
