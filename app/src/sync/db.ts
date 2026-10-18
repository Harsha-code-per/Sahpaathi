import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Tap } from '../lib/types'

/** One checkpoint answer (docs/EPISODE_SCHEMA.md, player rule 5). `event_id` lets POST /sync dedupe retries. */
export interface TapEvent {
  kind: 'tap'
  event_id: string
  episode_id: string
  segment_id: string
  tap: Tap
  /** true when nobody tapped and the 10 s fallback chose `core`. */
  auto: boolean
  /** ISO 8601, device clock. */
  at: string
}

// Attendance events join this union when attendance lands.
export type OutboxEvent = TapEvent

interface SahpaathiDB extends DBSchema {
  outbox: { key: string; value: OutboxEvent; indexes: { at: string } }
}

const DB_NAME = 'sahpaathi'
let db: Promise<IDBPDatabase<SahpaathiDB>> | undefined

export function getDB() {
  db ??= openDB<SahpaathiDB>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at')
    },
  })
  return db
}

/** Closes the shared connection (tests swap in a fresh IndexedDB between cases). */
export async function closeDB() {
  const open = db
  db = undefined
  ;(await open)?.close()
}
