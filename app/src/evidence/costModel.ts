/**
 * What Sahpaathi costs, from docs/ROADMAP.md ("What it costs"): the same assumptions, as a function, so the
 * evidence page and the document cannot disagree. All amounts are rupees.
 */

/** Writing, reviewing and voicing one lesson, once (about 205): Claude and Haiku about 84, Sarvam voice 21, a reviewer's 20 minutes 100. */
export const LESSON_COST = 205
/** 3 lessons a week for 36 weeks, for each of Grades 1 to 3. */
export const LESSONS_PER_LANGUAGE = 3 * 36 * 3
/** A ₹500 speaker lasting three years. */
export const SPEAKER_PER_YEAR = 500 / 3
/** School days a year that a catch-up call can be needed. */
export const LESSON_DAYS = 108

export interface CostInputs {
  classrooms: number
  languages: number
  children: number
  /** Share of children absent on a lesson day, 0 to 100. */
  absentPct: number
  /** Minutes of one catch-up call. */
  callMinutes: number
  /** What a call minute costs. Exotel does not publish a rate: third-party figures are 0.50 to 1.50. */
  ratePerMinute: number
}

export const DEFAULTS: CostInputs = { classrooms: 1000, languages: 1, children: 30, absentPct: 20, callMinutes: 4, ratePerMinute: 1 }

export interface Cost {
  content: number
  speaker: number
  calls: number
  hosting: number
  perClassroom: number
  perChild: number
  perChildWithoutCalls: number
  callsPerClassroom: number
}

export function cost(i: CostInputs): Cost {
  const classrooms = Math.max(1, i.classrooms)
  const children = Math.max(1, i.children)
  const callsPerClassroom = children * (i.absentPct / 100) * LESSON_DAYS
  const content = (LESSON_COST * LESSONS_PER_LANGUAGE * Math.max(1, i.languages)) / classrooms
  const calls = callsPerClassroom * i.callMinutes * i.ratePerMinute
  // Free tiers at pilot size, then a few rupees a classroom, falling as it spreads.
  const hosting = classrooms <= 10 ? 0 : classrooms < 10_000 ? 24 : 10
  const perClassroom = content + SPEAKER_PER_YEAR + calls + hosting
  return {
    content,
    speaker: SPEAKER_PER_YEAR,
    calls,
    hosting,
    perClassroom,
    perChild: perClassroom / children,
    perChildWithoutCalls: (perClassroom - calls) / children,
    callsPerClassroom,
  }
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
