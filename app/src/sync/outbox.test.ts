import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDB } from '../storage/db'
import { pendingCount, pendingEvents, recordTap, removeEvents } from './outbox'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

const tapAt = (iso: string, segment_id = 's1') =>
  recordTap({ episode_id: 'ep1', segment_id, tap: 'most', auto: false }, new Date(iso))

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
    expect((await pendingEvents()).map((e) => e.segment_id)).toEqual(['s1', 's2', 's3'])
    expect((await pendingEvents(2)).map((e) => e.segment_id)).toEqual(['s1', 's2'])
  })

  it('removes only the given events', async () => {
    const a = await tapAt('2026-10-19T04:30:00Z', 's1')
    await tapAt('2026-10-19T04:31:00Z', 's2')
    await removeEvents([a.event_id, 'not-there'])
    expect((await pendingEvents()).map((e) => e.segment_id)).toEqual(['s2'])
  })
})
