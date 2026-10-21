import type { Episode, Lang, Line } from '../lib/types'
import type { Criterion, Issue, Review, Status } from './api'

// Pure helpers for the Studio screens (tested in view.test.ts).

export const LANG_NAMES: Record<Lang, string> = { ta: 'Tamil', hi: 'Hindi', or: 'Odia', sat: 'Santali', en: 'English' }

export const STATUS: Record<Status, { label: string; tone: string }> = {
  generating: { label: 'Writing', tone: 'bg-secondary text-secondary-foreground' },
  failed: { label: 'Failed', tone: 'bg-bad text-bad-foreground' },
  in_review: { label: 'Needs review', tone: 'bg-warn text-warn-foreground' },
  approved: { label: 'Approved', tone: 'bg-ok text-ok-foreground' },
  rejected: { label: 'Rejected', tone: 'bg-bad text-bad-foreground' },
}

/** A status badge that never crashes: a status this build doesn't know yet (API deployed first) shows as plain text. */
export const badge = (map: Record<string, { label: string; tone: string }>, key: string) =>
  map[key] ?? { label: key.replace(/_/g, ' '), tone: 'bg-secondary text-secondary-foreground' }

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

/** Which language the Studio is read in. English is the default for reviewers; the original is one click away. */
export type View = 'english' | 'original'
const VIEW_KEY = 'sahpaathi.studio.view'

export function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'original' ? 'original' : 'english'
  } catch {
    return 'english'
  }
}

export function storeView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // the choice just is not remembered
  }
}

/** "Grade 1: Numbers to 20" and the district, from the catalog, which is already in English. */
export function englishName(
  catalog: { lessons: { id: string; grade: number; chapter: string }[]; districts: { id: string; name: string }[] } | null,
  lessonId: string,
  districtId: string,
) {
  const lesson = catalog?.lessons.find((l) => l.id === lessonId)
  const district = catalog?.districts.find((d) => d.id === districtId)
  return { title: lesson ? `Grade ${lesson.grade}: ${lesson.chapter}` : null, district: district?.name ?? districtId }
}
