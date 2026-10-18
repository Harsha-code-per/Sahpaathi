import type { Summary } from '../studio/api'
import type { Day, PackStatus, PackSummary } from './api'

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
