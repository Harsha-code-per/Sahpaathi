import type { Episode, Line, Tap } from '../lib/types'

// Pure episode state machine (docs/EPISODE_SCHEMA.md, "Player rules"). Timers and audio live in Teacher.tsx.

export type Part = 'teach' | 'easier' | 'core' | 'stretch'

export type Phase =
  | { kind: 'idle' }
  | { kind: 'line'; seg: number; part: Part; line: number }
  | { kind: 'checkpoint'; seg: number }
  | { kind: 'done' }

export const BRANCH: Record<Tap, Part> = { few: 'easier', some: 'core', most: 'stretch' }

/** No tap within this many seconds plays `core`. */
export const CHECKPOINT_TIMEOUT_SEC = 10

/** Lands on the first playable line from (seg, part, line), skipping empty parts. */
function enter(ep: Episode, seg: number, part: Part, line: number): Phase {
  const segment = ep.segments[seg]
  if (!segment) return { kind: 'done' }
  if (line < segment[part].length) return { kind: 'line', seg, part, line }
  return part === 'teach' ? { kind: 'checkpoint', seg } : enter(ep, seg + 1, 'teach', 0)
}

export function start(ep: Episode): Phase {
  return enter(ep, 0, 'teach', 0)
}

/** Call when the current line (audio + pause) has finished. */
export function advance(ep: Episode, p: Phase): Phase {
  return p.kind === 'line' ? enter(ep, p.seg, p.part, p.line + 1) : p
}

export function tap(ep: Episode, p: Phase, t: Tap): Phase {
  return p.kind === 'checkpoint' ? enter(ep, p.seg, BRANCH[t], 0) : p
}

export function currentLine(ep: Episode, p: Phase): Line | null {
  return p.kind === 'line' ? ep.segments[p.seg][p.part][p.line] : null
}
