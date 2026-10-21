import { BASE } from '../studio/api'

export type Lang = 'en' | 'hi' | 'ta' | 'or'
export type Style = 'normal' | 'simple'
export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/** Mirror of backend app/tutor/models.py. */
export interface Question {
  ask: string
  answer: string
  hint: string
}
export interface Part {
  title: string
  points: string[]
  example: string
  minutes: number
  quiz: Question[]
}
export interface Plan {
  title: string
  language: Lang
  parts: Part[]
}
export type Activity = 'riddle' | 'maths' | 'pattern' | 'memory' | 'stretch'
export interface Game {
  kind: Activity
  language: Lang
  questions: Question[]
  round: number
  score: number
  tries: number
}
export interface Progress {
  mode: 'chat' | 'teach' | 'quiz' | 'break' | 'game' | 'done'
  part: number
  q: number
  misses: number
  correct: number
  revealed: string[]
  since_break: number
  parts_since_break: number
  resume: 'teach' | 'quiz' | null
  game: Game | null
}
export interface TurnOut {
  reply: string
  progress: Progress
  language: Lang
  style: Style
  start_study: string | null
}
export interface Attachment {
  name: string
  media_type: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain'
  data: string
}

export const FRESH: Progress = { mode: 'chat', part: 0, q: 0, misses: 0, correct: 0, revealed: [], since_break: 0, parts_since_break: 0, resume: null, game: null }
const MAX_FILE = 5 * 1024 * 1024

/** The tutor is open to anyone (no login); the server caps what it can spend per day. */
async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}/tutor/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return res
  const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => undefined)
  throw new Error(typeof detail === 'string' ? detail : 'The teacher could not answer. Try again.')
}

/** Analyses a topic or an attached file into a plan of parts. Takes about 15 seconds. */
export async function makePlan(topic: string, document: Attachment | null, language: Lang, style: Style): Promise<Plan> {
  const res = await post('plan', { topic, document, language, style })
  return (await res.json()) as Plan
}

export interface TurnIn {
  messages: Turn[]
  text: string
  begin: boolean
  plan: Plan | null
  progress: Progress
  language: Lang
  style: Style
}

/** One step of the conversation: the server applies the teaching rules and returns the reply and the new position. */
export async function turn(body: TurnIn): Promise<TurnOut> {
  return (await (await post('turn', body)).json()) as TurnOut
}

/** Server voice (Sarvam) as a playable URL, or null when the server has none: the caller then speaks it itself. */
export async function speakUrl(text: string, language: Lang): Promise<string | null> {
  try {
    const res = await post('speak', { text: text.slice(0, 600), language })
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

/** Reads a chosen file into what /plan accepts: a PDF, a photo of a page, or plain text. */
export function readAttachment(file: File): Promise<Attachment> {
  const type = file.type || (file.name.endsWith('.txt') ? 'text/plain' : '')
  const ok = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain']
  if (!ok.includes(type)) return Promise.reject(new Error('Please attach a PDF, a photo (PNG, JPG) or a text file.'))
  if (file.size > MAX_FILE) return Promise.reject(new Error('That file is over 5 MB. Try a smaller one, or a photo of one page.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => resolve({ name: file.name, media_type: type as Attachment['media_type'], data: String(reader.result).split(',')[1] ?? '' })
    reader.readAsDataURL(file)
  })
}
