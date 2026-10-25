import type { Phase } from './player'

// Where a lesson was left, so a bell, a visitor or a dead battery does not mean starting again.
const KEY = 'sahpaathi.resume'
interface Saved {
  id: string
  phase: Phase
}

export function saveSpot(id: string, phase: Phase) {
  try {
    if (phase.kind === 'line' || phase.kind === 'checkpoint') localStorage.setItem(KEY, JSON.stringify({ id, phase } satisfies Saved))
    else if (phase.kind === 'done') localStorage.removeItem(KEY)
  } catch {
    /* private mode: no resume */
  }
}

/** The saved spot for this lesson, if it is past the very first line and still fits the lesson. */
export function loadSpot(id: string, segments: number): Phase | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (!s || s.id !== id) return null
    const p = s.phase
    if ((p.kind !== 'line' && p.kind !== 'checkpoint') || !(p.seg >= 0 && p.seg < segments)) return null
    return p.kind === 'line' && p.seg === 0 && p.part === 'teach' && p.line === 0 ? null : p
  } catch {
    return null
  }
}
