import type { Episode } from '../lib/types'
import type { OutboxEvent, TapEvent } from '../storage/db'

export type PlanReason = 'new' | 'revisit' | 'next'
export interface Plan {
  episode: Episode
  reason: PlanReason
  /** Share of deliberate taps that were "Few got it", for `revisit`. */
  fewPct?: number
}

/** A lesson is worth repeating when at least this share of its deliberate taps said "Few got it". */
const REVISIT_FEW = 0.4

/**
 * Today's suggestion from what this phone saw: a lesson never played first (lowest grade first), else the
 * one the class struggled with, else the one played longest ago. The teacher can always pick another.
 */
export function todaysPlan(episodes: Episode[], events: OutboxEvent[]): Plan | null {
  if (episodes.length === 0) return null
  const last = new Map<string, string>()
  const taps = new Map<string, { few: number; all: number }>()
  for (const e of events) {
    if (e.at > (last.get(e.episode_id) ?? '')) last.set(e.episode_id, e.at)
    if (e.kind === 'tap' && !(e as TapEvent).auto) {
      const c = taps.get(e.episode_id) ?? { few: 0, all: 0 }
      c.all++
      if ((e as TapEvent).tap === 'few') c.few++
      taps.set(e.episode_id, c)
    }
  }
  const unplayed = episodes.filter((e) => !last.has(e.id)).sort((a, b) => a.grade - b.grade)
  if (unplayed.length) return { episode: unplayed[0], reason: 'new' }
  const hard = episodes
    .map((episode) => ({ episode, share: (taps.get(episode.id)?.few ?? 0) / Math.max(1, taps.get(episode.id)?.all ?? 0) }))
    .filter((x) => x.share >= REVISIT_FEW)
    .sort((a, b) => b.share - a.share)[0]
  if (hard) return { episode: hard.episode, reason: 'revisit', fewPct: Math.round(hard.share * 100) }
  const oldest = [...episodes].sort((a, b) => (last.get(a.id) ?? '').localeCompare(last.get(b.id) ?? ''))[0]
  return { episode: oldest, reason: 'next' }
}
