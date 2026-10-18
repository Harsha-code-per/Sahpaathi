import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Episode, Tap } from '../lib/types'

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

/** What the lesson list needs; kept apart from the audio so listing lessons stays cheap. */
export interface StoredPack {
  id: string
  episode: Episode
  imported_at: string
}

/** A verified pack's audio (line id -> bytes) and its original zip, kept for sharing. */
export interface StoredPackFiles {
  id: string
  audio: Record<string, Uint8Array<ArrayBuffer>>
  zip: Uint8Array<ArrayBuffer>
}

interface SahpaathiDB extends DBSchema {
  outbox: { key: string; value: OutboxEvent; indexes: { at: string } }
  packs: { key: string; value: StoredPack }
  pack_files: { key: string; value: StoredPackFiles }
}

const DB_NAME = 'sahpaathi'
let db: Promise<IDBPDatabase<SahpaathiDB>> | undefined

export function getDB() {
  db ??= openDB<SahpaathiDB>(DB_NAME, 2, {
    // Each version only adds stores, so phones upgrading from any older version keep their data.
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at')
      if (oldVersion < 2) {
        d.createObjectStore('packs', { keyPath: 'id' })
        d.createObjectStore('pack_files', { keyPath: 'id' })
      }
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
