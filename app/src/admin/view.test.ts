import { expect, test } from 'vitest'
import type { Summary } from '../studio/api'
import type { PackSummary } from './api'
import { anyBuilding, dayBars, formatSize, packRows, pct } from './view'

const ep = (id: number, status: Summary['status']): Summary => ({
  id, lesson_id: 'l', district_id: 'd', status, title: `Episode ${id}`, passed: true, scores: null, error: null,
  created_at: '2026-10-19T04:00:00Z',
})
const pack = (id: number, episode_id: number, status: PackSummary['status']): PackSummary => ({
  id, episode_id, status, error: null, size_bytes: 1000, title: null, grade: 1, district_id: 'd',
  created_at: '2026-10-19T04:00:00Z',
})

test('pct rounds, and shows a dash when there is nothing to measure', () => {
  expect(pct(62.4)).toBe('62%')
  expect(pct(0)).toBe('0%')
  expect(pct(null)).toBe('–')
})

test('day bars scale to the busiest day and survive an empty week', () => {
  const bars = dayBars([{ date: 'a', taps: 5 }, { date: 'b', taps: 10 }, { date: 'c', taps: 0 }])
  expect(bars.map((b) => b.height)).toEqual([50, 100, 0])
  expect(dayBars([{ date: 'a', taps: 0 }])[0].height).toBe(0)
})

test('sizes read as KB below a megabyte and MB above', () => {
  expect(formatSize(null)).toBe('')
  expect(formatSize(744_461)).toBe('727 KB')
  expect(formatSize(1_572_864)).toBe('1.5 MB')
})

test('only approved episodes get a row, newest first, with their latest and downloadable pack', () => {
  const rows = packRows(
    [ep(1, 'approved'), ep(2, 'in_review'), ep(3, 'approved'), ep(4, 'rejected')],
    [pack(10, 1, 'ready'), pack(11, 1, 'failed'), pack(12, 3, 'building')],
  )
  expect(rows.map((r) => r.episode.id)).toEqual([3, 1])
  expect(rows[0].latest?.status).toBe('building')
  expect(rows[0].ready).toBeNull()
  expect(rows[1].latest?.id).toBe(11) // the newest attempt failed...
  expect(rows[1].ready?.id).toBe(10) // ...but the earlier pack can still be downloaded
})

test('polling is needed only while a pack is building', () => {
  expect(anyBuilding([pack(1, 1, 'ready'), pack(2, 1, 'building')])).toBe(true)
  expect(anyBuilding([pack(1, 1, 'ready'), pack(2, 1, 'failed')])).toBe(false)
})
