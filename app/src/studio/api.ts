import type { Episode } from '../lib/types'

// Studio talks to the backend (docs/API.md). The token lives in sessionStorage: one login per tab.

export const BASE = `${String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api/v1`
const TOKEN_KEY = 'sahpaathi.studio.token'

export type Status = 'generating' | 'failed' | 'in_review' | 'approved' | 'rejected'
export type Criterion = 'pedagogy' | 'age_fit' | 'accuracy' | 'language_bridge' | 'localisation' | 'safety'

export interface Issue {
  line_id: string
  criterion: Criterion
  problem: string
  fix: string
}

/** Mirror of backend app/factory/judge.py Review. */
export interface Review {
  model: string
  rubric: { scores: Record<Criterion, { score: number; reason: string }>; issues: Issue[] }
  gloss: { line_id: string; english: string }[]
}

export interface Summary {
  id: number
  lesson_id: string
  district_id: string
  status: Status
  title: string | null
  passed: boolean | null
  scores: Record<Criterion, number> | null
  error: string | null
  created_at: string
}

/** A reviewer's correction of one line; `before` is the AI's original wording. */
export interface Edit {
  before: string
  by: string
  at: string
}

export interface Detail extends Summary {
  episode: Episode | null
  review: Review | null
  review_notes: string | null
  reviewed_by: string | null
  edits: Record<string, Edit> | null
}

export interface Catalog {
  lessons: { id: string; grade: number; subject: string; chapter: string; nipun_lo: string }[]
  districts: { id: string; name: string; state: string; home_lang: string; school_lang: string }[]
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

export async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.get()
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  } catch {
    throw new ApiError('Cannot reach the Sahpaathi server. Check the internet connection.', 0)
  }
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null)
    throw new ApiError(typeof detail === 'string' ? detail : `The server answered ${res.status}.`, res.status)
  }
  return res.json() as Promise<T>
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

/** How classrooms answered one part's checkpoint (deliberate taps; `auto` = nobody tapped). */
export interface PartTaps {
  segment_id: string
  taps: number
  most: number
  some: number
  few: number
  auto: number
}

export const api = {
  login: (email: string, password: string) =>
    call<{ token: string; role: string; name: string }>('/auth/login', post({ email, password })),
  catalog: () => call<Catalog>('/catalog'),
  episodes: () => call<Summary[]>('/episodes'),
  episode: (id: number) => call<Detail>(`/episodes/${id}`),
  generate: (lesson_id: string, district_id: string) => call<Summary>('/episodes', post({ lesson_id, district_id })),
  decide: (id: number, decision: 'approve' | 'reject', notes: string) =>
    call<Detail>(`/episodes/${id}/review`, post({ decision, notes })),
  editLine: (id: number, lineId: string, text: string) =>
    call<Detail>(`/episodes/${id}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  classroom: (id: number) => call<PartTaps[]>(`/episodes/${id}/classroom`),
  /** Claude rewrites one part as a new version, which then goes through review like any lesson. */
  rewrite: (id: number, segmentId: string, note: string) => call<Summary>(`/episodes/${id}/segments/${segmentId}/rewrite`, post({ note })),
}
