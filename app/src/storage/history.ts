import { getDB, HISTORY_DAYS, type AttendanceEvent, type FeedbackEvent, type OutboxEvent, type TapEvent } from './db'

// The teacher's own record of what this phone saw, for the "My class" tab. It is a private copy kept on
// the phone only: it is never sent anywhere (that is the outbox's job), holds only what the outbox held
// (taps, absent roll codes, ratings; no names), is dropped after HISTORY_DAYS, and can be cleared at once.

/** Keeps a copy of an event the outbox just accepted. A failure here must never block the lesson. */
export async function remember(event: OutboxEvent, now = new Date()): Promise<void> {
  try {
    const db = await getDB()
    await db.put('history', event)
    const cutoff = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString()
    const old = await db.getAllKeysFromIndex('history', 'at', IDBKeyRange.upperBound(cutoff))
    await Promise.all(old.map((k) => db.delete('history', k)))
  } catch (e) {
    console.error('Could not keep class history', e)
  }
}

export async function listHistory(): Promise<OutboxEvent[]> {
  return (await getDB()).getAllFromIndex('history', 'at')
}

export async function clearHistory(): Promise<void> {
  await (await getDB()).clear('history')
}

// ---- the views the "My class" tab shows, as pure functions so they can be tested ------------------------------------

export interface LessonResult {
  episode_id: string
  plays: number
  taps: { most: number; some: number; few: number }
  automatic: number
  lastPlayed: string
  rating: number | null
}

/** Per lesson: how often it was played, how the taps fell (deliberate ones only), and the teacher's own rating. */
export function lessonResults(events: OutboxEvent[]): LessonResult[] {
  const by = new Map<string, LessonResult & { days: Set<string>; stars: number[] }>()
  const get = (id: string) => {
    let r = by.get(id)
    if (!r) by.set(id, (r = { episode_id: id, plays: 0, taps: { most: 0, some: 0, few: 0 }, automatic: 0, lastPlayed: '', rating: null, days: new Set(), stars: [] }))
    return r
  }
  for (const e of events) {
    const r = get(e.episode_id)
    r.lastPlayed = e.at > r.lastPlayed ? e.at : r.lastPlayed
    if (e.kind === 'tap') {
      r.days.add(e.at.slice(0, 10))
      if (e.auto) r.automatic++
      else r.taps[(e as TapEvent).tap]++
    } else if (e.kind === 'feedback') r.stars.push((e as FeedbackEvent).rating)
    else r.days.add(e.at.slice(0, 10))
  }
  return [...by.values()]
    .map(({ days, stars, ...r }) => ({ ...r, plays: days.size, rating: stars.length ? Math.round((10 * stars.reduce((a, b) => a + b, 0)) / stars.length) / 10 : null }))
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))
}

export interface AbsenceRow {
  roll: string
  missed: number
}

/** Roll codes by how many lessons they missed, most first: who the teacher may want to check on. */
export function absences(events: OutboxEvent[]): AbsenceRow[] {
  const counts = new Map<string, number>()
  for (const e of events) if (e.kind === 'attendance') for (const r of (e as AttendanceEvent).absent) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts].map(([roll, missed]) => ({ roll, missed })).sort((a, b) => b.missed - a.missed || a.roll.localeCompare(b.roll, undefined, { numeric: true }))
}

/** One entry per lesson play with attendance saved: how many were absent, newest first. */
export function attendanceLog(events: OutboxEvent[]): { at: string; episode_id: string; absent: number }[] {
  return events
    .filter((e): e is AttendanceEvent => e.kind === 'attendance')
    .map((e) => ({ at: e.at, episode_id: e.episode_id, absent: e.absent.length }))
    .sort((a, b) => b.at.localeCompare(a.at))
}
