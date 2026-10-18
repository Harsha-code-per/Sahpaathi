import { getDB, type AttendanceEvent, type OutboxEvent, type TapEvent } from '../storage/db'

// Everything the classroom produces is written here first and only leaves the device via flushOutbox (client.ts).

export async function recordTap(e: Pick<TapEvent, 'episode_id' | 'segment_id' | 'tap' | 'auto'>, now = new Date()) {
  const event: TapEvent = { kind: 'tap', event_id: crypto.randomUUID(), at: now.toISOString(), ...e }
  await (await getDB()).add('outbox', event)
  return event
}

export async function recordAttendance(e: Pick<AttendanceEvent, 'classroom_id' | 'episode_id' | 'absent'>, now = new Date()) {
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
