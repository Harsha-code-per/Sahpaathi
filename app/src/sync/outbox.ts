import { getDB, isCode, MAX_ABSENT, type AttendanceEvent, type OutboxEvent, type TapEvent } from '../storage/db'

// Everything the classroom produces is written here first and only leaves the device via flushOutbox (client.ts).

export async function recordTap(e: Pick<TapEvent, 'episode_id' | 'segment_id' | 'tap' | 'auto'>, now = new Date()) {
  const event: TapEvent = { kind: 'tap', event_id: crypto.randomUUID(), at: now.toISOString(), ...e }
  await (await getDB()).add('outbox', event)
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
  const event: AttendanceEvent = { kind: 'attendance', event_id: crypto.randomUUID(), at: now.toISOString(), ...e }
  await (await getDB()).add('outbox', event)
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
