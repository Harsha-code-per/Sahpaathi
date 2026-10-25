import { describe, expect, it } from 'vitest'
import type { Episode, Tap } from '../lib/types'
import type { OutboxEvent } from '../storage/db'
import { todaysPlan } from './plan'

const ep = (id: string, grade = 1) => ({ id, grade }) as Episode
const tap = (episode_id: string, t: Tap, at: string, auto = false) => ({ kind: 'tap', event_id: at + t, episode_id, segment_id: 's', tap: t, auto, at }) as OutboxEvent

describe('todaysPlan', () => {
  it('is null with no lessons', () => expect(todaysPlan([], [])).toBeNull())

  it('starts with the lowest-grade lesson never played', () => {
    const p = todaysPlan([ep('a', 3), ep('b', 1)], [tap('b', 'most', '2026-10-01')])
    expect(p).toMatchObject({ reason: 'new', episode: { id: 'a' } })
    expect(todaysPlan([ep('a', 3), ep('b', 2)], [])?.episode.id).toBe('b')
  })

  it('repeats the lesson the class struggled with, ignoring no-tap fallbacks', () => {
    const events = [
      tap('a', 'few', '2026-10-01'),
      tap('a', 'few', '2026-10-02'),
      tap('a', 'most', '2026-10-03'),
      tap('b', 'most', '2026-10-04'),
      tap('b', 'some', '2026-10-05', true),
    ]
    expect(todaysPlan([ep('a'), ep('b')], events)).toMatchObject({ reason: 'revisit', fewPct: 67, episode: { id: 'a' } })
  })

  it('otherwise suggests the one played longest ago', () => {
    const events = [tap('a', 'most', '2026-10-05'), tap('b', 'most', '2026-10-01')]
    expect(todaysPlan([ep('a'), ep('b')], events)).toMatchObject({ reason: 'next', episode: { id: 'b' } })
  })
})
