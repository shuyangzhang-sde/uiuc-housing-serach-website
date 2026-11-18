const sensitiveKey = /email|password|passcode|token|authorization|cookie|secret|dsn|user|request|extra|contexts/i
/** Crash messages can contain arbitrary backend/user content; retain stack locations, not payloads. */
export function scrubCrash<T>(input: T): T {
  function clean(value: unknown, key = "", depth = 0): unknown {
    if (depth > 12 || sensitiveKey.test(key)) return undefined
    if (typeof value === "string") {
      if (["message", "value"].includes(key)) return "Application error (details removed)"
      return value.replace(/https?:\/\/[^\s"<>]+/g, url => {
        try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}` } catch { return "[url]" }
      }).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/\beyJ[A-Za-z0-9_.-]+/g, "[token]").replace(/\b\d{6,8}\b/g, "[code]")
    }
    if (Array.isArray(value)) return value.map(item => clean(item, key, depth + 1))
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k, depth + 1)]).filter(([, v]) => v !== undefined))
    return value
  }
  return clean(input) as T
}
