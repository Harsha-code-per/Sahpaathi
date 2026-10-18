import { pendingCount, pendingEvents, removeEvents } from './outbox'

/** Small batches so one request fits through a 2G connection. */
export const SYNC_BATCH = 100

export interface SyncResult {
  sent: number
  pending: number
  /** Why events are still waiting: no API configured, offline, or the server's HTTP status. */
  error?: string
}

let inFlight: Promise<SyncResult> | undefined

/**
 * Sends queued events to POST /api/v1/sync, oldest first, and deletes each batch only after a 2xx.
 * Anything that fails stays queued for the next attempt; the server dedupes by event_id.
 * Concurrent calls share one run.
 */
export function flushOutbox(apiUrl = import.meta.env.VITE_API_URL as string | undefined, fetchFn: typeof fetch = fetch) {
  inFlight ??= send(apiUrl, fetchFn).finally(() => (inFlight = undefined))
  return inFlight
}

async function send(apiUrl: string | undefined, fetchFn: typeof fetch): Promise<SyncResult> {
  let sent = 0
  const stop = async (error: string) => ({ sent, pending: await pendingCount(), error })
  if (!apiUrl) return stop('no API URL configured')

  const url = `${apiUrl.replace(/\/+$/, '')}/api/v1/sync`
  for (;;) {
    const events = await pendingEvents(SYNC_BATCH)
    if (events.length === 0) return { sent, pending: 0 }
    let res: Response
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      })
    } catch {
      return stop('offline')
    }
    if (!res.ok) return stop(`HTTP ${res.status}`)
    await removeEvents(events.map((e) => e.event_id))
    sent += events.length
  }
}
