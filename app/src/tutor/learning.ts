import type { Lang, Plan, Progress } from './api'

// "My learning": what the AI teacher helped one learner with, kept only in this browser and only if they
// turn it on. It is off by default, holds no name or contact (only lesson titles, how far they got and the
// questions they were told the answer to), and turning it off deletes it. Nothing here is sent anywhere
// except by the "explain this to my mother" button, which sends just the title and the list below.

export const ENABLED_KEY = 'sahpaathi.learning.on'
export const RECORDS_KEY = 'sahpaathi.learning.v1'
export const MAX_RECORDS = 30

export interface LearningRecord {
  id: string
  title: string
  language: Lang
  /** Local date the lesson started, YYYY-MM-DD, for streaks. */
  day: string
  partTitles: string[]
  partsDone: number
  correct: number
  /** The questions the learner was given the answer to, to practise again. */
  revise: string[]
  finished: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function newRecord(plan: Plan, language: Lang, now = new Date()): LearningRecord {
  return {
    id: `${now.getTime()}`,
    title: plan.title,
    language,
    day: localDay(now),
    partTitles: plan.parts.map((p) => p.title),
    partsDone: 0,
    correct: 0,
    revise: [],
    finished: false,
  }
}

/** The record after the lesson moved: parts passed so far, questions right, what to practise again. */
export function advance(r: LearningRecord, p: Progress): LearningRecord {
  const finished = p.mode === 'done'
  return {
    ...r,
    partsDone: finished ? r.partTitles.length : Math.min(p.part, r.partTitles.length),
    correct: p.correct,
    revise: p.revealed.slice(0, 5),
    finished: r.finished || finished,
  }
}

/** Consecutive days, counting back from today (or from yesterday if there is no lesson yet today), with a lesson. */
export function streak(records: LearningRecord[], today = new Date()): number {
  const days = new Set(records.map((r) => r.day))
  const cursor = new Date(today)
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(localDay(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

/** What to practise: the newest lessons' open questions, each tagged with its lesson. */
export function toRevise(records: LearningRecord[], limit = 5): { title: string; item: string }[] {
  return records.flatMap((r) => r.revise.map((item) => ({ title: r.title, item }))).slice(0, limit)
}

export function isEnabled(store: Store): boolean {
  try {
    return store.getItem(ENABLED_KEY) === '1'
  } catch {
    return false // private mode or blocked storage: behave as if it is off
  }
}

export function load(store: Store): LearningRecord[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(RECORDS_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as LearningRecord[]).filter((r) => r && typeof r.id === 'string' && Array.isArray(r.partTitles)) : []
  } catch {
    return []
  }
}

/** Newest first, capped. Returns what was kept; never throws (a full or blocked store just loses the save). */
export function save(store: Store, records: LearningRecord[]): LearningRecord[] {
  const kept = records.slice(0, MAX_RECORDS)
  try {
    store.setItem(RECORDS_KEY, JSON.stringify(kept))
  } catch {
    /* nothing to do: the screen still shows what is in memory */
  }
  return kept
}

export function setEnabled(store: Store, on: boolean): void {
  try {
    if (on) store.setItem(ENABLED_KEY, '1')
    else {
      store.removeItem(ENABLED_KEY)
      store.removeItem(RECORDS_KEY) // turning it off deletes it
    }
  } catch {
    /* ignore */
  }
}
