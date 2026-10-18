import type { Summary } from '../studio/api'
import type { CallOutcome, CallStatus, Day, PackStatus, PackSummary } from './api'

// Pure helpers for the Admin screens (tested in view.test.ts).

export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`)

/** Bar heights (0 to 100) relative to the busiest day, so a quiet week still shows its shape. */
export function dayBars(days: Day[]) {
  const max = Math.max(1, ...days.map((d) => d.taps))
  return days.map((d) => ({ ...d, height: Math.round((100 * d.taps) / max) }))
}

export const PACK_STATUS: Record<PackStatus, { label: string; tone: string }> = {
  building: { label: 'Building', tone: 'bg-slate-200 text-ink' },
  ready: { label: 'Ready', tone: 'bg-leaf/15 text-leaf' },
  failed: { label: 'Failed', tone: 'bg-clay/15 text-clay' },
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
  queued: { label: 'Waiting to call', tone: 'bg-slate-200 text-ink' },
  in_progress: { label: 'On the phone', tone: 'bg-sun/30 text-ink' },
  completed: { label: 'Answered', tone: 'bg-leaf/15 text-leaf' },
  no_response: { label: 'No answer', tone: 'bg-clay/15 text-clay' },
}

export const OUTCOME: Record<CallOutcome, { label: string; tone: string }> = {
  understood: { label: 'Child understood', tone: 'bg-leaf/15 text-leaf' },
  help: { label: 'Needs help', tone: 'bg-clay/15 text-clay' },
}

/** A phone's keypad, row by row. */
export const KEYPAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']]

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
