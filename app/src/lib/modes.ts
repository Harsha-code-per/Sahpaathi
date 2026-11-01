/**
 * Sahpaathi has two modes that share one curriculum. They are separate on purpose: the classroom
 * mode must work with no network at all, the parent helper needs one. A hybrid (the helper
 * supporting a child at home with what the class just learned, using the same taps) is a third entry
 * here when it is built; see docs/MODES.md.
 */
export type ModeId = 'offline' | 'online'

export interface Mode {
  id: ModeId
  label: string
  /** A shorter name for narrow screens. */
  short: string
  /** Where the mode lives. */
  path: string
  /** Does it need internet while in use? */
  internet: boolean
  tagline: string
  /** Shown on the landing page and in docs/MODES.md. */
  features: string[]
  cta: string
}

export const MODES: Record<ModeId, Mode> = {
  offline: {
    id: 'offline',
    label: 'Offline classroom',
    short: 'Classroom',
    path: '/teacher',
    internet: false,
    tagline: 'A group of children, one teacher phone, one speaker. No internet in the room.',
    features: [
      'Weekly signed lesson packs sit on the teacher’s phone and play through a ₹500 speaker for the whole group',
      'After each part she taps Most, Some or Few got it, and the lesson switches to stretch, more practice or easier',
      'A choral mic hint suggests the branch; the teacher decides',
      'Attendance is saved offline; absent children get an evening catch-up call on a basic phone (keys 1, 2, 3 answer back)',
    ],
    cta: 'Open the teacher app',
  },
  online: {
    id: 'online',
    label: 'Parent helper',
    short: 'Parents',
    path: '/tutor',
    internet: true,
    tagline: 'A prototype for a parent and child at home. Needs a phone and a signal. Not for use by young children alone.',
    features: [
      'Talk like to a person: ask it to explain what the class is learning',
      'Study mode splits any topic, PDF or photo of a textbook page into parts, explains each, asks questions, and explains again when needed',
      'Interrupt any time: explain again, like I’m 5, in Hindi, Tamil or Odia',
      'Friendly breaks with riddles, quick maths and a memory game',
    ],
    cta: 'Try the parent helper',
  },
}

/** Which mode a page belongs to, for the switch. Other pages (landing, Studio, Admin) belong to neither. */
export function modeOf(pathname: string): ModeId | null {
  if (pathname.startsWith('/tutor')) return 'online'
  if (pathname.startsWith('/teacher')) return 'offline'
  return null
}
