import { expect, test } from 'vitest'
import type { Summary } from '../studio/api'
import type { PackSummary } from './api'
import { anyBuilding, callableEpisodes, CLASS_STATUS, dayBars, endMessage, formatSize, KEYPAD, lessonTitles, mixBar, packFilename, packRows, partName, pct, pipeline, weekSummary } from './view'

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

test('mixBar scales Most, Some and Few to fill a bar, and is empty with no taps', () => {
  const bar = mixBar({ taps: 20, pct_most: 50, pct_some: 30, pct_few: 20 })
  expect(bar).toEqual({ most: 50, some: 30, few: 20 })
  expect(mixBar({ taps: 10, pct_most: 49.9, pct_some: 30, pct_few: 20 }).most + mixBar({ taps: 10, pct_most: 49.9, pct_some: 30, pct_few: 20 }).some + mixBar({ taps: 10, pct_most: 49.9, pct_some: 30, pct_few: 20 }).few).toBeCloseTo(100)
  expect(mixBar({ taps: 0, pct_most: null, pct_some: null, pct_few: null })).toEqual({ most: 0, some: 0, few: 0 })
})

test('every class status has a look and a plain-words hint', () => {
  expect(Object.keys(CLASS_STATUS).sort()).toEqual(['doing well', 'needs support', 'not enough taps yet', 'watch'])
  for (const s of Object.values(CLASS_STATUS)) expect(s.hint.length).toBeGreaterThan(10)
})

test('partName turns a segment id into words and leaves anything else alone', () => {
  expect(partName('s3')).toBe('Part 3')
  expect(partName('intro')).toBe('intro')
})

test('lessonTitles maps an episode id (lesson-district) to the Studio title', () => {
  const e = { ...ep(1, 'approved'), lesson_id: 'g1-numbers-to-20', district_id: 'chennai-migrant', title: 'Counting to 20' }
  expect(lessonTitles([e, { ...ep(2, 'approved'), title: null }]).get('g1-numbers-to-20-chennai-migrant')).toBe('Counting to 20')
  expect(lessonTitles([{ ...ep(2, 'approved'), title: null }]).size).toBe(0)
})

test('weekSummary describes the first and last weeks with taps, and says when there are none', () => {
  const weeks = [
    { label: '1 Sep', Most: null, Few: null },
    { label: '8 Sep', Most: 40, Few: 30 },
    { label: '15 Sep', Most: 55, Few: 20 },
  ]
  expect(weekSummary(weeks)).toContain('went from 40% (8 Sep) to 55% (15 Sep)')
  expect(weekSummary([{ label: '1 Sep', Most: null, Few: null }])).toMatch(/no taps/)
})
