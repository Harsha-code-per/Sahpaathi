import { describe, expect, it } from 'vitest'
import type { Episode, Tap } from '../lib/types'
import type { OutboxEvent } from '../storage/db'
import { applyOrder, autoOrder, gradesOf, move, teachingDates } from './schedule'

const ep = (id: string, grade: number, nipun_lo: string, subject: Episode['subject'] = 'numeracy') => ({ id, grade, nipun_lo, subject, title: id }) as Episode
const tap = (episode_id: string, t: Tap, at: string) => ({ kind: 'tap', event_id: at + episode_id + t, episode_id, segment_id: 's', tap: t, auto: false, at }) as OutboxEvent

describe('autoOrder', () => {
  it('puts untaught topics first by learning outcome, comparing the numbers not the text', () => {
    const eps = [ep('c', 1, 'N1.10'), ep('a', 1, 'N1.2'), ep('b', 1, 'N1.3')]
    expect(autoOrder(eps, [])).toEqual(['a', 'b', 'c'])
  })

  it('then repeats what the class struggled with, then the rest oldest first', () => {
    const eps = [ep('a', 1, 'N1.1'), ep('b', 1, 'N1.2'), ep('c', 1, 'N1.3'), ep('d', 1, 'N1.4')]
    const events = [tap('a', 'most', '2026-10-01'), tap('b', 'few', '2026-10-02'), tap('b', 'few', '2026-10-02'), tap('c', 'most', '2026-10-03')]
    expect(autoOrder(eps, events)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('applyOrder and move', () => {
  const eps = [ep('a', 1, 'N1.1'), ep('b', 1, 'N1.2'), ep('c', 1, 'N1.3')]
  it('keeps her order, drops removed topics and appends new ones', () => {
    expect(applyOrder(eps, ['c', 'gone', 'a'], []).map((e) => e.id)).toEqual(['c', 'a', 'b'])
    expect(applyOrder(eps, undefined, []).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
  it('moves a topic one step, and not past the ends', () => {
    expect(move(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(move(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })
})

describe('teachingDates', () => {
  it('skips the days she does not teach, counting today', () => {
    const monday = new Date(2026, 9, 26) // Mon 26 Oct 2026
    const days = teachingDates(4, [1, 3, 5], monday).map((d) => d.getDate())
    expect(days).toEqual([26, 28, 30, 2]) // Mon, Wed, Fri, then Mon 2 Nov
  })
  it('is empty when she teaches on no days', () => expect(teachingDates(3, [], new Date())).toEqual([]))
})

describe('gradesOf', () => {
  it('lists the grades a subject has, lowest first', () => {
    const eps = [ep('a', 3, 'x'), ep('b', 1, 'x'), ep('c', 2, 'x', 'literacy'), ep('d', 1, 'x')]
    expect(gradesOf(eps, 'numeracy')).toEqual([1, 3])
    expect(gradesOf(eps, 'literacy')).toEqual([2])
  })
})
