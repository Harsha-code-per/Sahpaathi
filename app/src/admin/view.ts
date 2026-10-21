import type { Summary } from '../studio/api'
import type { CallOutcome, CallStatus, ClassStatus, Day, EpisodeUsage, Mix, PackStatus, PackSummary } from './api'

// Pure helpers for the Admin screens (tested in view.test.ts).

export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`)

/** Bar heights (0 to 100) relative to the busiest day, so a quiet week still shows its shape. */
export function dayBars(days: Day[]) {
  const max = Math.max(1, ...days.map((d) => d.taps))
  return days.map((d) => ({ ...d, height: Math.round((100 * d.taps) / max) }))
}

export const PACK_STATUS: Record<PackStatus, { label: string; tone: string }> = {
  building: { label: 'Building', tone: 'bg-secondary text-secondary-foreground' },
  ready: { label: 'Ready', tone: 'bg-ok text-ok-foreground' },
  failed: { label: 'Failed', tone: 'bg-bad text-bad-foreground' },
}

export function formatSize(bytes: number | null) {
  if (bytes === null) return ''
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export interface PackRow {
  episode: Summary
  /** Most recent attempt, any status. */
  latest: PackSummary | null
  /** Most recent finished pack: what can be downloaded. */
  ready: PackSummary | null
}

/** One row per approved episode (only those can get a pack), newest episode first. */
export function packRows(episodes: Summary[], packs: PackSummary[]): PackRow[] {
  return episodes
    .filter((e) => e.status === 'approved')
    .sort((a, b) => b.id - a.id)
    .map((episode) => {
      const mine = packs.filter((p) => p.episode_id === episode.id).sort((a, b) => b.id - a.id)
      return { episode, latest: mine[0] ?? null, ready: mine.find((p) => p.status === 'ready') ?? null }
    })
}

export const anyBuilding = (packs: PackSummary[]) => packs.some((p) => p.status === 'building')

/** The server names the file after the episode slug. Anything else (a title with a colon or Tamil
 * letters) breaks on Windows and Android, so only a plain slug is trusted. */
export function packFilename(disposition: string | null, packId: number) {
  const name = /filename="([a-z0-9][a-z0-9-]*\.sahpaathi)"/.exec(disposition ?? '')?.[1]
  return name ?? `pack-${packId}.sahpaathi`
}

export const CALL_STATUS: Record<CallStatus, { label: string; tone: string }> = {
  queued: { label: 'Waiting to call', tone: 'bg-secondary text-secondary-foreground' },
  in_progress: { label: 'On the phone', tone: 'bg-warn text-warn-foreground' },
  completed: { label: 'Answered', tone: 'bg-ok text-ok-foreground' },
  no_response: { label: 'No answer', tone: 'bg-bad text-bad-foreground' },
}

export const OUTCOME: Record<CallOutcome, { label: string; tone: string }> = {
  understood: { label: 'Child understood', tone: 'bg-ok text-ok-foreground' },
  help: { label: 'Needs help', tone: 'bg-bad text-bad-foreground' },
}

/** A phone's keypad, row by row. */
export const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

/** Seconds a parent has to press a key before the menu repeats. */
export const KEY_WAIT_SEC = 8

/** What to tell the admin when a call has ended. */
export function endMessage(status: CallStatus, outcome: CallOutcome | null) {
  if (status === 'completed' && outcome === 'help') return 'The family asked for help. Ask the teacher to follow up.'
  if (status === 'completed') return 'The family says the child understood.'
  return 'Nobody pressed a key, so the call ended without an answer.'
}

export interface CallableEpisode {
  slug: string
  title: string
}

/** Episodes that have a ready pack (so a call has audio), once each, newest first. */
export function callableEpisodes(packs: PackSummary[]): CallableEpisode[] {
  const seen = new Set<string>()
  return packs
    .filter((p) => p.status === 'ready' && p.episode_slug)
    .sort((a, b) => b.id - a.id)
    .flatMap((p) => {
      const slug = p.episode_slug as string
      if (seen.has(slug)) return []
      seen.add(slug)
      return [{ slug, title: p.title ?? slug }]
    })
}

export interface PipelineCard {
  episode: Summary
  pack: PackSummary | null
  usage: EpisodeUsage | null
}

/** Kanban columns, left to right. A lesson is "in classrooms" once a phone has synced taps for it. */
export function pipeline(episodes: Summary[], packs: PackSummary[], usage: EpisodeUsage[]) {
  const cols = {
    writing: { key: 'writing', label: 'Writing', empty: 'Nothing being written.', cards: [] as PipelineCard[] },
    review: { key: 'review', label: 'Needs review', empty: 'All reviewed.', cards: [] as PipelineCard[] },
    approved: { key: 'approved', label: 'Approved', empty: 'None waiting for voice.', cards: [] as PipelineCard[] },
    packed: { key: 'packed', label: 'Voiced & packed', empty: 'No packs yet.', cards: [] as PipelineCard[] },
    used: { key: 'used', label: 'In classrooms', empty: 'No taps synced yet.', cards: [] as PipelineCard[] },
  }
  const bySlug = new Map(usage.map((u) => [u.episode_id, u]))
  for (const episode of [...episodes].sort((a, b) => b.id - a.id)) {
    const pack = packs.filter((p) => p.episode_id === episode.id && p.status === 'ready').sort((a, b) => b.id - a.id)[0] ?? null
    const used = pack?.episode_slug ? (bySlug.get(pack.episode_slug) ?? null) : null
    const card = { episode, pack, usage: used }
    if (episode.status === 'generating' || episode.status === 'failed') cols.writing.cards.push(card)
    else if (episode.status === 'in_review') cols.review.cards.push(card)
    else if (episode.status !== 'approved')
      continue // rejected lessons leave the pipeline
    else if (used) cols.used.cards.push(card)
    else if (pack) cols.packed.cards.push(card)
    else cols.approved.cards.push(card)
  }
  return Object.values(cols)
}

/** How each class status looks and what it means in words a block officer can act on. */
export const CLASS_STATUS: Record<ClassStatus, { tone: string; hint: string }> = {
  'needs support': { tone: 'bg-bad text-bad-foreground', hint: 'About a third or more of the checkpoints were "Few got it". Visit, or send an easier lesson.' },
  watch: { tone: 'bg-warn text-warn-foreground', hint: 'A quarter or more said "Few got it", or nothing has synced for over two weeks.' },
  'doing well': { tone: 'bg-ok text-ok-foreground', hint: 'Most children are following.' },
  'not enough taps yet': { tone: 'bg-secondary text-secondary-foreground', hint: 'Fewer than 8 deliberate taps, too few to say anything.' },
}

/** The week-by-week chart in words, for screen readers (the chart itself is drawn, not read). */
export function weekSummary(weeks: { label: string; Most: number | null; Few: number | null }[]) {
  const seen = weeks.filter((w) => w.Most !== null)
  if (!seen.length) return 'Week by week: no taps in the last 8 weeks.'
  const first = seen[0]
  const last = seen[seen.length - 1]
  return `Week by week, ${seen.length} weeks with taps. "Most got it" went from ${first.Most}% (${first.label}) to ${last.Most}% (${last.label}); "Few got it" from ${first.Few ?? 0}% to ${last.Few ?? 0}%.`
}

/** Widths (summing to 100) for a Most / Some / Few bar; all zero when nobody has tapped. */
export function mixBar(m: Mix) {
  const total = (m.pct_most ?? 0) + (m.pct_some ?? 0) + (m.pct_few ?? 0)
  if (!m.taps || total === 0) return { most: 0, some: 0, few: 0 }
  return { most: ((m.pct_most ?? 0) * 100) / total, some: ((m.pct_some ?? 0) * 100) / total, few: ((m.pct_few ?? 0) * 100) / total }
}

/** "Part 3" from a segment id like "s3". */
export const partName = (segmentId: string) => (/^s(\d+)$/.exec(segmentId) ? `Part ${/^s(\d+)$/.exec(segmentId)![1]}` : segmentId)

/** A lesson's own id is "<lesson>-<district>"; this maps it to its title from the Studio list. */
export function lessonTitles(episodes: Summary[]): Map<string, string> {
  return new Map(episodes.filter((e) => e.title).map((e) => [`${e.lesson_id}-${e.district_id}`, e.title!]))
}
