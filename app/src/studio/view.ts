import type { Episode, Lang, Line } from '../lib/types'
import type { Criterion, Issue, Review, Status } from './api'

// Pure helpers for the Studio screens (tested in view.test.ts).

export const LANG_NAMES: Record<Lang, string> = { ta: 'Tamil', hi: 'Hindi', or: 'Odia', sat: 'Santali', en: 'English' }

export const STATUS: Record<Status, { label: string; tone: string }> = {
  generating: { label: 'Writing', tone: 'bg-slate-200 text-ink' },
  failed: { label: 'Failed', tone: 'bg-clay/15 text-clay' },
  in_review: { label: 'Needs review', tone: 'bg-sun/30 text-ink' },
  approved: { label: 'Approved', tone: 'bg-leaf/15 text-leaf' },
  rejected: { label: 'Rejected', tone: 'bg-clay/15 text-clay' },
}

export const CRITERIA: { key: Criterion; label: string }[] = [
  { key: 'pedagogy', label: 'Teaching' },
  { key: 'age_fit', label: 'Age fit' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'language_bridge', label: 'Language bridge' },
  { key: 'localisation', label: 'Local fit' },
  { key: 'safety', label: 'Safety' },
]

/** Same measure as backend rules.school_shares: share of teach + core lines in the school language. */
export function schoolShare(ep: Episode, segment: number) {
  const lines = [...ep.segments[segment].teach, ...ep.segments[segment].core]
  return lines.length ? lines.filter((l) => l.lang === ep.school_lang).length / lines.length : 0
}

/** Issues keyed by line id; issues that name no real line (e.g. "s1-checkpoint") go under "episode". */
export function issuesByLine(ep: Episode, review: Review | null): Map<string, Issue[]> {
  const ids = new Set(allLines(ep).map((l) => l.id))
  const out = new Map<string, Issue[]>()
  for (const issue of review?.rubric.issues ?? []) {
    const key = ids.has(issue.line_id) ? issue.line_id : 'episode'
    out.set(key, [...(out.get(key) ?? []), issue])
  }
  return out
}

export function glossById(review: Review | null): Map<string, string> {
  return new Map((review?.gloss ?? []).map((g) => [g.line_id, g.english]))
}

export function allLines(ep: Episode): Line[] {
  return [...ep.segments.flatMap((s) => [...s.teach, ...s.easier, ...s.core, ...s.stretch]), ...ep.analogy, ...ep.ivr_recap]
}

/** Rough spoken length: ~13 characters a second plus every pause, as the backend estimates. */
export function minutes(lines: Line[]) {
  return lines.reduce((s, l) => s + l.text.length / 13 + l.pause_after_sec, 0) / 60
}

/** The chalk sketch as an <img> source: an image can't run scripts, unlike injected SVG markup. */
export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
