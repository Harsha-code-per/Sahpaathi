// Attendance helpers for the lesson player (pure, tested in roster.test.ts).
// Children are only ever roll numbers inside a class code: no names or phone numbers are stored or sent.

/** The same rule as the server (POST /sync): letters, digits and hyphens, at most 40. Never a name. */
export const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/
export const MAX_CLASS_SIZE = 80
const KEY = 'sahpaathi.class'

export interface ClassSetup {
  classroom: string
  size: number
}

export const NO_CLASS: ClassSetup = { classroom: '', size: 30 }

/** Why a setup cannot be used, or null when it can. */
export function setupProblem(s: ClassSetup): string | null {
  if (!CODE_PATTERN.test(s.classroom)) return 'Class code: use letters, numbers and hyphens only (for example CLASS-1). No names.'
  if (!Number.isInteger(s.size) || s.size < 1 || s.size > MAX_CLASS_SIZE) return `Number of children: 1 to ${MAX_CLASS_SIZE}.`
  return null
}

/** Adds or removes one roll number, keeping the list sorted. */
export function toggleRoll(absent: readonly number[], roll: number): number[] {
  return absent.includes(roll) ? absent.filter((r) => r !== roll) : [...absent, roll].sort((a, b) => a - b)
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The class this phone teaches, remembered between lessons. A damaged value falls back to "not set up". */
export function loadSetup(store: Store = localStorage): ClassSetup {
  try {
    const v = JSON.parse(store.getItem(KEY) ?? 'null')
    const setup = { classroom: String(v?.classroom ?? ''), size: Number(v?.size) }
    return setupProblem(setup) === null ? setup : NO_CLASS
  } catch {
    return NO_CLASS
  }
}

export function saveSetup(setup: ClassSetup, store: Store = localStorage): void {
  store.setItem(KEY, JSON.stringify(setup))
}
