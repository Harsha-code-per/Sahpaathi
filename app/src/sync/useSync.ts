import { useCallback, useEffect, useState } from 'react'
import { flushOutbox } from './client'

/** Every 30 s an empty outbox costs one IndexedDB count and no request. */
const RETRY_MS = 30_000

/**
 * Flushes the outbox on mount, whenever the device comes back online, and every RETRY_MS: on 2G the
 * `online` event often never fires (the radio stays attached while data drops) or fires before data
 * flows. `pending` is null until the first run.
 */
export function useSync() {
  const [pending, setPending] = useState<number | null>(null)

  const sync = useCallback(
    () =>
      flushOutbox().then(
        (r) => setPending(r.pending),
        (e) => console.error('Sync failed', e),
      ),
    [],
  )

  useEffect(() => {
    window.addEventListener('online', sync)
    const retry = window.setInterval(sync, RETRY_MS)
    sync()
    return () => {
      window.removeEventListener('online', sync)
      window.clearInterval(retry)
    }
  }, [sync])

  return { pending, sync }
}
