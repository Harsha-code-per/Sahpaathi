import type { Tap } from '../lib/types'

// Choral mic hint (docs/EPISODE_SCHEMA.md, player rule 3). Pure logic: levels in, suggested tap out.
// Never decides for the teacher, and only ever sees loudness numbers, never audio.

export type Hint = { tap: Tap; score: number } | null

/** A frame counts as a child speaking when it is this far above the classroom's ambient level. */
export const ACTIVE_MARGIN_DB = 6
/** Average excess over ambient (dB) at which answers count as fully loud. */
export const FULL_LOUDNESS_DB = 15
export const MOST_AT = 0.5
export const SOME_AT = 0.2
/** Fewer frames than this (10 per second, so 1.5 s) is too little to judge. */
export const MIN_FRAMES = 15

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * `ambient`: dBFS frames measured before the question. `answer`: dBFS frames while children respond.
 * Score = share of answer frames with speech x how loud that speech is. Returns null when there is
 * too little data, so the player shows no suggestion rather than a wrong one.
 */
export function hintFromLevels(ambient: number[], answer: number[]): Hint {
  if (ambient.length < MIN_FRAMES || answer.length < MIN_FRAMES) return null
  const floor = median(ambient)
  const active = answer.map((db) => db - floor).filter((excess) => excess > ACTIVE_MARGIN_DB)
  const participation = active.length / answer.length
  const loudness = active.length ? Math.min(1, active.reduce((a, b) => a + b, 0) / active.length / FULL_LOUDNESS_DB) : 0
  const score = participation * loudness
  return { tap: score >= MOST_AT ? 'most' : score >= SOME_AT ? 'some' : 'few', score }
}
