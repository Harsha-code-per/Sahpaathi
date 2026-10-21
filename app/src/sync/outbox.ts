import { uuid } from '@/lib/utils'
import { FEEDBACK_TAGS, getDB, isCode, MAX_ABSENT, type AttendanceEvent, type FeedbackEvent, type FeedbackTag, type OutboxEvent, type TapEvent } from '../storage/db'
import { remember } from '../storage/history'

// Everything the classroom produces is written here first and only leaves the device via flushOutbox (client.ts).

/** The classroom code this phone was set up with, if any; taps carry it so the dashboard can tell classes apart. */
async function classroomCode() {
  const c = await (await getDB()).get('classroom', 'current')
  return c && isCode(c.classroom_id) ? c.classroom_id : undefined
}

export async function recordTap(e: Pick<TapEvent, 'episode_id' | 'segment_id' | 'tap' | 'auto'>, now = new Date()) {
  const classroom_id = await classroomCode()
  const event: TapEvent = { kind: 'tap', event_id: uuid(), at: now.toISOString(), ...e, ...(classroom_id && { classroom_id }) }
  await (await getDB()).add('outbox', event)
  await remember(event, now)
  return event
}

/** Queues the teacher's rating of the lesson just played ("was this lesson clear?"): 1 to 5 stars and a few tags. */
export async function recordFeedback(e: { episode_id: string; rating: number; tags: FeedbackTag[] }, now = new Date()) {
  if (!Number.isInteger(e.rating) || e.rating < 1 || e.rating > 5) throw new Error('A rating is 1 to 5 stars.')
  const tags = [...new Set(e.tags)].filter((t) => FEEDBACK_TAGS.includes(t))
  const classroom_id = await classroomCode()
  const event: FeedbackEvent = { kind: 'feedback', event_id: uuid(), at: now.toISOString(), episode_id: e.episode_id, rating: e.rating, tags, comment: '', ...(classroom_id && { classroom_id }) }
  await (await getDB()).add('outbox', event)
  await remember(event, now)
  return event
}

/** Queues one catch-up-call event for the lesson just played. */
export async function recordAttendance(
  e: Pick<AttendanceEvent, 'classroom_id' | 'episode_id' | 'absent'>,
  now = new Date(),
) {
  // A bad code must not sit in the outbox failing /sync on every retry, so check before anything is saved.
  const bad = [e.classroom_id, ...e.absent].find((c) => !isCode(c))
  if (bad) throw new Error(`"${bad}" is not a classroom or roll code: letters, digits and hyphen, starting with a letter or digit, up to 40 characters.`)
  if (e.absent.length > MAX_ABSENT) throw new Error(`At most ${MAX_ABSENT} children can be marked absent at once.`)
  const event: AttendanceEvent = { kind: 'attendance', event_id: uuid(), at: now.toISOString(), ...e }
  await (await getDB()).add('outbox', event)
  await remember(event, now)
  return event
}

/** Oldest first. */
export async function pendingEvents(limit?: number): Promise<OutboxEvent[]> {
  return (await getDB()).getAllFromIndex('outbox', 'at', null, limit)
}

export async function pendingCount() {
  return (await getDB()).count('outbox')
}

export async function removeEvents(ids: string[]) {
  const tx = (await getDB()).transaction('outbox', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}
