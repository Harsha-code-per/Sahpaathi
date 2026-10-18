import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDB, type OutboxEvent, type TapEvent } from '../storage/db'
import { pendingCount, pendingEvents, recordAttendance, recordTap, removeEvents } from './outbox'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

const tapAt = (iso: string, segment_id = 's1') =>
  recordTap({ episode_id: 'ep1', segment_id, tap: 'most', auto: false }, new Date(iso))

/** Outbox events are a union now, so segment-based assertions narrow to taps. */
const tapSegments = (es: OutboxEvent[]) => es.filter((e): e is TapEvent => e.kind === 'tap').map((e) => e.segment_id)

describe('outbox', () => {
  it('stores a tap with an id and timestamp', async () => {
    const e = await recordTap({ episode_id: 'ep1', segment_id: 's1', tap: 'some', auto: true }, new Date('2026-10-19T04:30:00Z'))
    expect(e).toMatchObject({ kind: 'tap', episode_id: 'ep1', segment_id: 's1', tap: 'some', auto: true, at: '2026-10-19T04:30:00.000Z' })
    expect(e.event_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await pendingEvents()).toEqual([e])
  })

  it('gives every event a unique id', async () => {
    const [a, b] = [await tapAt('2026-10-19T04:30:00Z'), await tapAt('2026-10-19T04:30:00Z')]
    expect(a.event_id).not.toBe(b.event_id)
    expect(await pendingCount()).toBe(2)
  })

  it('returns events oldest first, up to a limit', async () => {
    await tapAt('2026-10-19T04:32:00Z', 's3')
    await tapAt('2026-10-19T04:30:00Z', 's1')
    await tapAt('2026-10-19T04:31:00Z', 's2')
    expect(tapSegments(await pendingEvents())).toEqual(['s1', 's2', 's3'])
    expect(tapSegments(await pendingEvents(2))).toEqual(['s1', 's2'])
  })

  it('removes only the given events', async () => {
    const a = await tapAt('2026-10-19T04:30:00Z', 's1')
    await tapAt('2026-10-19T04:31:00Z', 's2')
    await removeEvents([a.event_id, 'not-there'])
    expect(tapSegments(await pendingEvents())).toEqual(['s2'])
  })
})

describe('recordAttendance', () => {
  it('stores attendance with an id, timestamp and the absent list kept as given', async () => {
    const e = await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['3', '7'] }, new Date('2026-10-19T05:00:00Z'))
    expect(e).toMatchObject({ kind: 'attendance', classroom_id: 'G2-A', episode_id: 'ep1', absent: ['3', '7'], at: '2026-10-19T05:00:00.000Z' })
    expect(e.event_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await pendingEvents()).toEqual([e])
  })

  it('allows an empty list: everyone was present', async () => {
    const e = await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: [] })
    expect(e.absent).toEqual([])
    expect(await pendingCount()).toBe(1)
  })

  it('gives attendance an id of its own, different from taps', async () => {
    const [t, a] = [
      await recordTap({ episode_id: 'ep1', segment_id: 's1', tap: 'few', auto: false }),
      await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['1'] }),
    ]
    expect(a.event_id).not.toBe(t.event_id)
    expect(await pendingCount()).toBe(2)
  })

  it('rejects a bad classroom or roll code before anything is saved', async () => {
    await expect(recordAttendance({ classroom_id: 'Ravi Kumar', episode_id: 'ep1', absent: [] })).rejects.toThrow(/classroom or roll code/)
    await expect(recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['+919876543210'] })).rejects.toThrow(/classroom or roll code/)
    expect(await pendingCount()).toBe(0)
  })
})
