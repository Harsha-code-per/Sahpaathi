import { expect, test } from 'vitest'
import type { Summary } from '../studio/api'
import type { PackSummary } from './api'
import { anyBuilding, callableEpisodes, dayBars, endMessage, formatSize, KEYPAD, packFilename, packRows, pct, pipeline } from './view'

const ep = (id: number, status: Summary['status']): Summary => ({
  id, lesson_id: 'l', district_id: 'd', status, title: `Episode ${id}`, passed: true, scores: null, error: null,
  created_at: '2026-10-19T04:00:00Z',
})
const pack = (id: number, episode_id: number, status: PackSummary['status']): PackSummary => ({
  id, episode_id, episode_slug: `ep-${episode_id}`, status, error: null, size_bytes: 1000, title: null, grade: 1, district_id: 'd',
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

test('the download is named after the episode slug, and nothing unsafe is trusted', () => {
  expect(packFilename('attachment; filename="g1-numbers-to-20.sahpaathi"', 7)).toBe('g1-numbers-to-20.sahpaathi')
  expect(packFilename(null, 7)).toBe('pack-7.sahpaathi')
  expect(packFilename('attachment; filename="கூழாங்கல்: ஒன்று.sahpaathi"', 7)).toBe('pack-7.sahpaathi')
  expect(packFilename('attachment; filename="../../x.sahpaathi"', 7)).toBe('pack-7.sahpaathi')
})

test('only episodes with a ready pack can be called about, once each, newest first', () => {
  const packs = [pack(1, 1, 'ready'), pack(2, 1, 'ready'), pack(3, 2, 'building'), pack(4, 3, 'ready'), pack(5, 4, 'failed')]
  packs[3].title = 'Counting'
  expect(callableEpisodes(packs)).toEqual([
    { slug: 'ep-3', title: 'Counting' },
    { slug: 'ep-1', title: 'ep-1' },
  ])
  expect(callableEpisodes([{ ...pack(9, 9, 'ready'), episode_slug: null }])).toEqual([])
})

test('the keypad has the twelve phone keys in phone order', () => {
  expect(KEYPAD.flat().join('')).toBe('123456789*0#')
})

test('the end of a call says what the family answered', () => {
  expect(endMessage('completed', 'help')).toMatch(/follow up/)
  expect(endMessage('completed', 'understood')).toMatch(/understood/)
  expect(endMessage('no_response', null)).toMatch(/without an answer/)
})

test('pipeline puts each lesson in one column, from writing to classroom use', () => {
  const usage = { episode_id: 'ep-5', taps: 4, most: 3, some: 1, few: 0, pct_most: 75, pct_some: 25, pct_few: 0, auto_fallbacks: 0 }
  const cols = pipeline(
    [ep(1, 'generating'), ep(2, 'failed'), ep(3, 'in_review'), ep(4, 'approved'), ep(5, 'approved'), ep(6, 'approved'), ep(7, 'rejected')],
    [pack(10, 5, 'ready'), pack(11, 6, 'ready'), pack(12, 4, 'building')],
    [usage],
  )
  const ids = Object.fromEntries(cols.map((c) => [c.key, c.cards.map((x) => x.episode.id)]))
  expect(ids).toEqual({ writing: [2, 1], review: [3], approved: [4], packed: [6], used: [5] })
  expect(cols.find((c) => c.key === 'used')!.cards[0].usage).toBe(usage)
})
