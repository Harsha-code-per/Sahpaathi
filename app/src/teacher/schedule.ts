import type { Episode } from '../lib/types'
import type { OutboxEvent, TapEvent } from '../storage/db'

// The teacher's timetable: pick a subject, then a grade, and the topics line up in the order to teach them, on
// the days she teaches. It works offline from what this phone knows, and she can move any topic.

export type Subject = Episode['subject']

/** 0 = Sunday ... 6 = Saturday, as Date.getDay(). */
export const DEFAULT_DAYS = [1, 2, 3, 4, 5]

/** "N1.2" < "N1.10": compares the learning-outcome codes by number, not as text. */
const byOutcome = (a: Episode, b: Episode) => a.nipun_lo.localeCompare(b.nipun_lo, undefined, { numeric: true }) || a.title.localeCompare(b.title)

/** A topic needs another pass when at least this share of its deliberate taps said "Few got it". */
const REVISIT_FEW = 0.4

/**
 * The order to teach: topics never taught first, by learning outcome; then the ones the class struggled with,
 * worst first; then the rest, longest ago first.
 */
export function autoOrder(episodes: Episode[], events: OutboxEvent[]): string[] {
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
  const share = (id: string) => (taps.get(id)?.few ?? 0) / Math.max(1, taps.get(id)?.all ?? 0)
  const fresh = episodes.filter((e) => !last.has(e.id)).sort(byOutcome)
  const played = episodes.filter((e) => last.has(e.id))
  const hard = played.filter((e) => share(e.id) >= REVISIT_FEW).sort((a, b) => share(b.id) - share(a.id))
  const rest = played.filter((e) => share(e.id) < REVISIT_FEW).sort((a, b) => (last.get(a.id) ?? '').localeCompare(last.get(b.id) ?? ''))
  return [...fresh, ...hard, ...rest].map((e) => e.id)
}

/** The saved order, with topics that arrived since appended in auto order and gone ones dropped. */
export function applyOrder(episodes: Episode[], saved: string[] | undefined, events: OutboxEvent[]): Episode[] {
  const byId = new Map(episodes.map((e) => [e.id, e]))
  const kept = (saved ?? []).filter((id) => byId.has(id))
  const added = autoOrder(episodes, events).filter((id) => !kept.includes(id))
  return [...kept, ...added].map((id) => byId.get(id)!)
}

/** Moves one topic up (-1) or down (+1); at the ends it stays put. */
export function move(order: string[], id: string, by: -1 | 1): string[] {
  const i = order.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return order
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** The next `count` teaching days from `from` (today counts), skipping days she does not teach. */
export function teachingDates(count: number, days: number[], from: Date): Date[] {
  if (days.length === 0) return []
  const out: Date[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let guard = 0; out.length < count && guard < count * 7 + 7; guard++) {
    if (days.includes(d.getDay())) out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Grades that have at least one topic in this subject, lowest first. */
export function gradesOf(episodes: Episode[], subject: Subject): number[] {
  return [...new Set(episodes.filter((e) => e.subject === subject).map((e) => e.grade))].sort((a, b) => a - b)
}
