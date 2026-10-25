import type { Episode, Line, Tap } from '../lib/types'

// Pure episode state machine (docs/EPISODE_SCHEMA.md, "Player rules"). Timers and audio live in Teacher.tsx.

export type Part = 'teach' | 'easier' | 'core' | 'stretch'

export type Phase =
  | { kind: 'idle' }
  | { kind: 'line'; seg: number; part: Part; line: number }
  | { kind: 'checkpoint'; seg: number }
  | { kind: 'analogy'; line: number; resume: Phase }
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
  if (p.kind === 'analogy') return p.line + 1 < ep.analogy.length ? { ...p, line: p.line + 1 } : p.resume
  return p.kind === 'line' ? enter(ep, p.seg, p.part, p.line + 1) : p
}

/** "Need a simpler analogy": play `analogy`, then go back to where we were (the interrupted line restarts). */
export function analogy(ep: Episode, p: Phase): Phase {
  const canPause = p.kind === 'line' || p.kind === 'checkpoint'
  return canPause && ep.analogy.length > 0 ? { kind: 'analogy', line: 0, resume: p } : p
}

export function tap(ep: Episode, p: Phase, t: Tap): Phase {
  return p.kind === 'checkpoint' ? enter(ep, p.seg, BRANCH[t], 0) : p
}

export function currentLine(ep: Episode, p: Phase): Line | null {
  if (p.kind === 'analogy') return ep.analogy[p.line]
  return p.kind === 'line' ? ep.segments[p.seg][p.part][p.line] : null
}

/** Lines that may play next: the following line, or the first line of each branch at a checkpoint. Used to warm audio so a tap switches instantly. */
export function upcoming(ep: Episode, p: Phase): Line[] {
  const next = p.kind === 'checkpoint' ? (['few', 'some', 'most'] as const).map((t) => tap(ep, p, t)) : [advance(ep, p)]
  return next.map((n) => currentLine(ep, n)).filter((l): l is Line => l !== null)
}
