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

/** The AI's review of one recording (backend/app/recordings.py): scores 1 to 5 and a few tips. */
export interface RecordingReview {
  clarity: number
  accuracy: number
  pace: number
  child_friendly: number
  safe: boolean
  summary: string
  tips: string[]
}

/**
 * A teacher's own voice recording of one topic. It is kept on the phone first (so it survives a missing signal
 * and a closed app), sent when she is signed in and online, then updated with the server's AI review.
 * `id` is made here, so a retried upload cannot store it twice.
 */
export interface RecordingRecord {
  id: string
  episode_id: string
  subject: 'numeracy' | 'literacy'
  grade: number
  lang: 'ta' | 'hi' | 'or' | 'en'
  classroom_id?: string
  duration_sec: number
  mime: string
  audio: Blob
  at: string
  /** saved: only on this phone; sent: the server has it; reviewed / unreviewed: the AI did / could not review it. */
  status: 'saved' | 'sent' | 'reviewed' | 'unreviewed'
  transcript?: string | null
  review?: RecordingReview | { note: string } | null
}

/** A PDF the teacher put on her shelf (a book chapter, a worksheet, her notes), kept for offline reading. */
export interface NoteRecord {
  id: string
  title: string
  /** 'general' when it is not for one subject. */
  subject: 'numeracy' | 'literacy' | 'general'
  /** 0 means every grade. */
  grade: number
  size: number
  blob: Blob
  at: string
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
  notes: { key: string; value: NoteRecord }
  recordings: { key: string; value: RecordingRecord; indexes: { episode_id: string } }
}

const DB_NAME = 'sahpaathi'
let db: Promise<IDBPDatabase<SahpaathiDB>> | undefined

export function getDB() {
  db ??= openDB<SahpaathiDB>(DB_NAME, 6, {
    // Each version only adds stores, so phones upgrading from any older version keep their data.
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at')
      if (oldVersion < 2) {
        d.createObjectStore('packs', { keyPath: 'id' })
        d.createObjectStore('pack_files', { keyPath: 'id' })
      }
      if (oldVersion < 3) d.createObjectStore('classroom', { keyPath: 'id' })
      if (oldVersion < 4) d.createObjectStore('history', { keyPath: 'event_id' }).createIndex('at', 'at')
      if (oldVersion < 6) d.createObjectStore('notes', { keyPath: 'id' })
      if (oldVersion < 5) d.createObjectStore('recordings', { keyPath: 'id' }).createIndex('episode_id', 'episode_id')
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
