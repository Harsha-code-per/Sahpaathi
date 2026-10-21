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
  /** The classroom code of this phone, when one is set up, so the dashboard can tell classes apart. */
  classroom_id?: string
}

/** One lesson's attendance (POST /sync contract): absent roll codes only, never names. One event per lesson play. */
export interface AttendanceEvent {
  kind: 'attendance'
  event_id: string
  classroom_id: string
  episode_id: string
  /** Roll numbers that missed the lesson; each gets one catch-up call. Empty means everyone was present. */
  absent: string[]
  /** ISO 8601, device clock. */
  at: string
}

/** The tags a teacher can put on a lesson rating. These exact words are what the server accepts. */
export const FEEDBACK_TAGS = ['clear', 'too fast', 'too slow', 'kids engaged', 'needs more examples', 'audio unclear', 'good local examples'] as const
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]

/** A teacher's answer to "was this lesson clear?": 1 to 5 stars and a few tags. Sent with the taps, never a name. */
export interface FeedbackEvent {
  kind: 'feedback'
  event_id: string
  episode_id: string
  classroom_id?: string
  rating: number
  tags: FeedbackTag[]
  comment: string
  /** ISO 8601, device clock. */
  at: string
}

/** The opaque codes the sync API accepts for classrooms and rolls (backend REF), so no names or phone numbers slip in. */
export const isCode = (s: string) => /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(s)

/** POST /sync takes at most this many absent rolls in one attendance event. */
export const MAX_ABSENT = 100

export type OutboxEvent = TapEvent | AttendanceEvent | FeedbackEvent

/** How long the phone keeps its own class history (the "My class" tab). It never leaves the phone. */
export const HISTORY_DAYS = 120

/** The classroom this phone is set up for; one record under 'current'. */
export interface ClassroomRecord {
  id: 'current'
  classroom_id: string
  rolls: string[]
}

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
  /** A private copy of what this phone recorded, for the teacher's own "My class" view. Never synced. */
  history: { key: string; value: OutboxEvent; indexes: { at: string } }
  packs: { key: string; value: StoredPack }
  pack_files: { key: string; value: StoredPackFiles }
  classroom: { key: string; value: ClassroomRecord }
}

const DB_NAME = 'sahpaathi'
let db: Promise<IDBPDatabase<SahpaathiDB>> | undefined

export function getDB() {
  db ??= openDB<SahpaathiDB>(DB_NAME, 4, {
    // Each version only adds stores, so phones upgrading from any older version keep their data.
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at')
      if (oldVersion < 2) {
        d.createObjectStore('packs', { keyPath: 'id' })
        d.createObjectStore('pack_files', { keyPath: 'id' })
      }
      if (oldVersion < 3) d.createObjectStore('classroom', { keyPath: 'id' })
      if (oldVersion < 4) d.createObjectStore('history', { keyPath: 'event_id' }).createIndex('at', 'at')
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
