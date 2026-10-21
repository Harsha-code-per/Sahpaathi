import { describe, expect, it } from 'vitest'
import type { Plan, Progress } from './api'
import { advance, ENABLED_KEY, isEnabled, load, localDay, MAX_RECORDS, newRecord, RECORDS_KEY, save, setEnabled, streak, toRevise, type LearningRecord } from './learning'

const plan = (n = 3): Plan => ({
  title: 'Place value',
  language: 'en',
  parts: Array.from({ length: n }, (_, i) => ({ title: `Part ${i + 1}`, points: ['p'], example: 'e', minutes: 3, quiz: [{ ask: 'q?', answer: 'a', hint: 'h' }] })),
})
const progress = (o: Partial<Progress>): Progress => ({ mode: 'quiz', part: 0, q: 0, misses: 0, correct: 0, revealed: [], since_break: 0, parts_since_break: 0, resume: null, game: null, ...o })

class Mem {
  data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
  removeItem = (k: string) => void this.data.delete(k)
}
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10)
const rec = (day: string, extra: Partial<LearningRecord> = {}): LearningRecord => ({ ...newRecord(plan(), 'en', at(2026, 10, 21)), day, ...extra })

describe('a lesson record', () => {
  it('starts empty and remembers the part titles, not any words the learner said', () => {
    const r = newRecord(plan(), 'ta', at(2026, 10, 21))
    expect(r).toMatchObject({ title: 'Place value', language: 'ta', day: '2026-10-21', partTitles: ['Part 1', 'Part 2', 'Part 3'], partsDone: 0, correct: 0, revise: [], finished: false })
    expect(Object.keys(r).sort()).toEqual(['correct', 'day', 'finished', 'id', 'language', 'partTitles', 'partsDone', 'revise', 'title'])
  })

  it('counts the parts passed (the current part is not passed yet) and keeps what to practise', () => {
    const r = advance(newRecord(plan(), 'en'), progress({ part: 2, correct: 3, revealed: ['Part 1: q? (a)'] }))
    expect(r).toMatchObject({ partsDone: 2, correct: 3, revise: ['Part 1: q? (a)'], finished: false })
  })

  it('is finished, with every part done, when the lesson ends, and stays finished', () => {
    const done = advance(newRecord(plan(), 'en'), progress({ mode: 'done', part: 2 }))
    expect(done).toMatchObject({ partsDone: 3, finished: true })
    expect(advance(done, progress({ mode: 'chat' })).finished).toBe(true)
  })

  it('keeps at most five things to practise', () => {
    expect(advance(newRecord(plan(), 'en'), progress({ revealed: Array(9).fill('x') })).revise).toHaveLength(5)
  })
})

describe('streak', () => {
  const today = at(2026, 10, 21)
  it('counts consecutive days, today included', () => {
    expect(streak([rec('2026-10-21'), rec('2026-10-20'), rec('2026-10-19')], today)).toBe(3)
  })
  it('keeps yesterday’s streak alive until today is over', () => {
    expect(streak([rec('2026-10-20'), rec('2026-10-19')], today)).toBe(2)
  })
  it('breaks on a missed day and on no lessons at all', () => {
    expect(streak([rec('2026-10-21'), rec('2026-10-19')], today)).toBe(1)
    expect(streak([rec('2026-10-17')], today)).toBe(0)
    expect(streak([], today)).toBe(0)
  })
  it('counts two lessons on one day once', () => {
    expect(streak([rec('2026-10-21'), rec('2026-10-21')], today)).toBe(1)
  })
  it('works across a month end', () => {
    expect(streak([rec('2026-11-01'), rec('2026-10-31')], at(2026, 11, 1))).toBe(2)
  })
})

describe('toRevise', () => {
  it('lists open questions newest first, each with its lesson, up to the limit', () => {
    const items = toRevise([rec('2026-10-21', { title: 'B', revise: ['b1', 'b2'] }), rec('2026-10-20', { title: 'A', revise: ['a1'] })], 2)
    expect(items).toEqual([
      { title: 'B', item: 'b1' },
      { title: 'B', item: 'b2' },
    ])
  })
})

describe('storage', () => {
  it('is off until the learner turns it on', () => {
    expect(isEnabled(new Mem())).toBe(false)
  })

  it('turning it off deletes everything that was saved', () => {
    const s = new Mem()
    setEnabled(s, true)
    save(s, [rec('2026-10-21')])
    expect(isEnabled(s)).toBe(true)
    expect(load(s)).toHaveLength(1)
    setEnabled(s, false)
    expect([isEnabled(s), load(s), s.data.has(RECORDS_KEY), s.data.has(ENABLED_KEY)]).toEqual([false, [], false, false])
  })

  it('keeps at most the newest 30', () => {
    const s = new Mem()
    const many = Array.from({ length: MAX_RECORDS + 5 }, (_, i) => rec('2026-10-21', { id: String(i) }))
    expect(save(s, many)).toHaveLength(MAX_RECORDS)
    expect(load(s)[0].id).toBe('0')
  })

  it('shrugs off damaged data and blocked storage', () => {
    const s = new Mem()
    s.setItem(RECORDS_KEY, '{not json')
    expect(load(s)).toEqual([])
    s.setItem(RECORDS_KEY, JSON.stringify([{ nope: 1 }, rec('2026-10-21')]))
    expect(load(s)).toHaveLength(1)
    const boom = () => {
      throw new Error('blocked')
    }
    const blocked = { getItem: boom, setItem: boom, removeItem: boom }
    expect(isEnabled(blocked)).toBe(false)
    expect(load(blocked)).toEqual([])
    expect(() => save(blocked, [rec('2026-10-21')])).not.toThrow()
    expect(() => setEnabled(blocked, false)).not.toThrow()
  })

  it('formats a local day with zero padding', () => {
    expect(localDay(at(2026, 3, 5))).toBe('2026-03-05')
  })
})
