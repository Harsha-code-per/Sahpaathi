import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveClassroom } from '../attendance/classroom'
import { pendingEvents, recordAttendance, recordFeedback, recordTap } from '../sync/outbox'
import { closeDB, getDB, HISTORY_DAYS, type FeedbackEvent, type TapEvent } from './db'
import { absences, attendanceLog, clearHistory, lessonResults, listHistory } from './history'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

const at = (day: number, hour = 4) => new Date(Date.UTC(2026, 9, day, hour))
const tap = (day: number, tap_: TapEvent['tap'], auto = false, episode = 'ep1', segment = 's1') =>
  recordTap({ episode_id: episode, segment_id: segment, tap: tap_, auto }, at(day))

describe('taps carry the classroom', () => {
  it('adds the classroom code once the phone has one, and not before', async () => {
    const before = await tap(19, 'most')
    expect('classroom_id' in before).toBe(false) // a phone with no class set up sends what it always sent
    await saveClassroom({ classroom_id: 'G2-A', rolls: ['1', '2', '3'] })
    const after = await tap(20, 'some')
    expect(after.classroom_id).toBe('G2-A')
    expect((await pendingEvents()).map((e) => ('classroom_id' in e ? e.classroom_id : undefined))).toEqual([undefined, 'G2-A'])
  })
})

describe('lesson feedback', () => {
  it('is queued like a tap, with the classroom, and only with tags the server accepts', async () => {
    await saveClassroom({ classroom_id: 'G2-A', rolls: ['1'] })
    const e = await recordFeedback({ episode_id: 'ep1', rating: 4, tags: ['clear', 'clear', 'rude' as never, 'too fast'] }, at(20))
    expect(e).toMatchObject({ kind: 'feedback', episode_id: 'ep1', classroom_id: 'G2-A', rating: 4, tags: ['clear', 'too fast'], comment: '' })
    expect(await pendingEvents()).toEqual([e])
  })

  it.each([0, 6, 2.5, NaN])('refuses a rating of %s', async (rating) => {
    await expect(recordFeedback({ episode_id: 'ep1', rating, tags: [] })).rejects.toThrow('1 to 5')
    expect(await pendingEvents()).toEqual([])
  })
})

describe('the private class history', () => {
  it('keeps a copy of everything recorded, and it stays when the outbox empties', async () => {
    await tap(19, 'most')
    await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['3'] }, at(19))
    await recordFeedback({ episode_id: 'ep1', rating: 5, tags: [] }, at(19))
    expect((await listHistory()).map((e) => e.kind).sort()).toEqual(['attendance', 'feedback', 'tap'])
    const db = await getDB()
    await db.clear('outbox') // as if every event had synced
    expect(await listHistory()).toHaveLength(3)
  })

  it('forgets what is older than the limit', async () => {
    const old = new Date(Date.UTC(2026, 9, 21) - (HISTORY_DAYS + 2) * 86_400_000)
    await recordTap({ episode_id: 'ep1', segment_id: 's1', tap: 'most', auto: false }, old)
    expect(await listHistory()).toHaveLength(1) // kept at first: nothing is older than itself
    await tap(20, 'few') // saving a new event sweeps out everything past the limit
    const kept = await listHistory()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ kind: 'tap', tap: 'few' })
  })

  it('can be cleared in one go and clearing it does not touch what is still waiting to sync', async () => {
    await tap(19, 'most')
    await clearHistory()
    expect(await listHistory()).toEqual([])
    expect(await pendingEvents()).toHaveLength(1)
  })
})

describe('what "My class" shows', () => {
  const events = async () => {
    await tap(19, 'most', false, 'ep1', 's1')
    await tap(19, 'few', false, 'ep1', 's2')
    await tap(19, 'some', true, 'ep1', 's3') // nobody tapped: the 10 s fallback
    await tap(21, 'most', false, 'ep1', 's1')
    await tap(20, 'few', false, 'ep2', 's1')
    await recordFeedback({ episode_id: 'ep1', rating: 4, tags: [] }, at(19, 6))
    await recordFeedback({ episode_id: 'ep1', rating: 5, tags: [] }, at(21, 6))
    await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['3', '12'] }, at(19, 7))
    await recordAttendance({ classroom_id: 'G2-A', episode_id: 'ep1', absent: ['3'] }, at(21, 7))
    return listHistory()
  }

  it('counts deliberate taps apart from automatic ones, plays by day, and averages the stars', async () => {
    const [ep1, ep2] = lessonResults(await events())
    expect(ep1).toMatchObject({ episode_id: 'ep1', plays: 2, taps: { most: 2, some: 0, few: 1 }, automatic: 1, rating: 4.5 })
    expect(ep2).toMatchObject({ episode_id: 'ep2', plays: 1, taps: { most: 0, some: 0, few: 1 }, rating: null })
  })

  it('puts the lesson played most recently first', async () => {
    expect(lessonResults(await events()).map((r) => r.episode_id)).toEqual(['ep1', 'ep2'])
  })

  it('ranks who missed the most lessons, by roll code only', async () => {
    expect(absences(await events())).toEqual([
      { roll: '3', missed: 2 },
      { roll: '12', missed: 1 },
    ])
  })

  it('lists each lesson with attendance, newest first', async () => {
    const log = attendanceLog(await events())
    expect(log.map((l) => l.absent)).toEqual([1, 2])
  })

  it('says nothing for an empty history', () => {
    expect([lessonResults([]), absences([]), attendanceLog([])]).toEqual([[], [], []])
  })

  it('keeps ratings out of the tap counts', async () => {
    const f = (await events()).filter((e): e is FeedbackEvent => e.kind === 'feedback')
    expect(f).toHaveLength(2)
    expect(lessonResults(f)[0].taps).toEqual({ most: 0, some: 0, few: 0 })
  })
})
