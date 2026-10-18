import { useCallback, useEffect, useState } from 'react'
import { flushOutbox } from './client'

/** Flushes the outbox on mount and whenever the device comes back online. `pending` is null until the first run. */
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
    sync()
    return () => window.removeEventListener('online', sync)
  }, [sync])

  return { pending, sync }
}
