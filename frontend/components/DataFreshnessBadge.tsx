"use client"

import { useEffect, useState } from "react"
import { fetchStatus, type DataStatus } from "@/lib/api"

const STATUS_REFRESH_MS = 5 * 60 * 1000

export default function DataFreshnessBadge() {
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refreshStatus() {
      try {
        const result = await fetchStatus()
        if (!cancelled) {
          setStatus(result)
          setUnavailable(false)
        }
      } catch {
        // A failed status check must not leave an old green freshness claim.
        if (!cancelled) setUnavailable(true)
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshStatus()
    }

    void refreshStatus()
    const intervalId = window.setInterval(refreshWhenVisible, STATUS_REFRESH_MS)
    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [])

  if (!status && !unavailable) return null

  const checkedAt = status?.freshness?.last_successful_check_at ?? null
  const lastChecked = formatSnapshotDateTime(checkedAt)
  const stale = unavailable || status?.freshness?.state !== "fresh"

  return (
    <div className="fixed bottom-4 right-4 z-[95] flex max-w-64 flex-col items-end rounded-lg bg-white/95 px-3 py-2 text-right leading-none shadow-sm lg:bottom-auto lg:top-3 lg:bg-transparent lg:p-0 lg:shadow-none print:hidden">
      <span className="text-[11px] font-bold text-ink-900/50">
        Last checked
      </span>
      <span className="mt-1 text-[13px] font-bold text-ink-900">
        {lastChecked ?? "Not verified"}
      </span>
      <span className="mt-1 text-[10px] text-ink-900/60">Daily at 6 AM Chicago time</span>
      {stale && (
        <p role="status" className="mt-1 max-w-64 rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
          Data may be outdated. Confirm price and availability with the landlord.
        </p>
      )}
    </div>
  )
}

function formatSnapshotDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(date)
}
