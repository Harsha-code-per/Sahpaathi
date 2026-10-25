// The teacher's playback settings, kept on the phone so they survive between lessons. Each is a real classroom
// problem: children need more time to answer, a back-row child can't hear, a fast voice is hard to follow,
// small text can't be read from the back.

export interface Prefs {
  /** Audio speed (and timed-text speed). */
  rate: 0.8 | 1 | 1.25
  /** Multiplies every pause, so children get longer to answer. */
  answer: 1 | 1.5 | 2
  /** Size of the lesson text on the phone. */
  text: 'm' | 'l' | 'xl'
  /** Voice gain; above 1 is louder than the phone's own maximum. */
  boost: 1 | 1.5 | 2
}

export const DEFAULT_PREFS: Prefs = { rate: 1, answer: 1, text: 'm', boost: 1 }
const KEY = 'sahpaathi.player-prefs'

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

export function parsePrefs(raw: string | null): Prefs {
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>
    return {
      rate: pick(o.rate, [0.8, 1, 1.25] as const, 1),
      answer: pick(o.answer, [1, 1.5, 2] as const, 1),
      text: pick(o.text, ['m', 'l', 'xl'] as const, 'm'),
      boost: pick(o.boost, [1, 1.5, 2] as const, 1),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* private mode: the setting just lasts for this visit */
  }
}

/** Seconds a line stays up when it has no audio, and how long its pause lasts, at these settings. */
export const lineSeconds = (textLength: number, p: Prefs) => Math.max(2, textLength * 0.07) / p.rate
export const pauseSeconds = (pause: number, p: Prefs) => pause * p.answer

export type Room = 'quiet' | 'busy' | 'loud'

/** Classifies the room from its average level in dBFS (0 is full scale; speech at arm's length is about -25). */
export function roomFromDb(db: number): Room {
  return db > -35 ? 'loud' : db > -50 ? 'busy' : 'quiet'
}

/** What to do about the room: a louder, slightly slower voice, and longer answers when it is very noisy. */
export const ROOM_SETTINGS: Record<Room, Pick<Prefs, 'boost' | 'rate'>> = {
  quiet: { boost: 1, rate: 1 },
  busy: { boost: 1.5, rate: 1 },
  loud: { boost: 2, rate: 0.8 },
}
