import { api as studio, ApiError, BASE, call, session, SIGNED_OUT } from '../studio/api'
import type { Summary } from '../studio/api'
import { packFilename } from './view'

// Admin talks to the same backend as the Studio (docs/API.md) and shares its login token.
export { ApiError, session, SIGNED_OUT }

export interface Understanding {
  taps: number // deliberate taps only
  most: number
  some: number
  few: number
  pct_most: number | null // null until there is a deliberate tap
  pct_some: number | null
  pct_few: number | null
}

export interface EpisodeUsage extends Understanding {
  episode_id: string
  auto_fallbacks: number
}

export interface Day {
  date: string
  taps: number
}

export interface CatchupStats {
  total: number
  queued: number
  in_progress: number
  completed: number // a parent pressed 2 or 3
  no_response: number
  understood: number // pressed 2
  help: number // pressed 3: the teacher should follow up
  pct_answered: number | null // completed of the finished calls; null until one has finished
}

export interface Dashboard {
  overall: Understanding
  auto_fallbacks: number
  episodes: EpisodeUsage[]
  last_days: Day[]
  episodes_by_status: Record<string, number>
  packs_ready: number
  catchup_calls: CatchupStats
}

export type PackStatus = 'building' | 'ready' | 'failed'

export interface PackSummary {
  id: number
  episode_id: number
  episode_slug: string | null // the episode's own id, as attendance and calls use it
  status: PackStatus
  error: string | null
  size_bytes: number | null
  title: string | null
  grade: number | null
  district_id: string
  created_at: string
}

export type CallStatus = 'queued' | 'in_progress' | 'completed' | 'no_response'
export type CallOutcome = 'understood' | 'help'

export interface CallSummary {
  id: number
  classroom_id: string
  student_ref: string
  episode_slug: string
  status: CallStatus
  outcome: CallOutcome | null
  plays: number
  created_at: string
}

/** One thing to do on the call: play these in order, then wait for a key if `gather`. */
export interface CallStep {
  play: { name: 'recap' | 'menu'; url: string }[]
  gather: boolean
  hangup: boolean
  status: CallStatus
  outcome: CallOutcome | null
}

export const adminApi = {
  login: studio.login,
  episodes: studio.episodes,
  dashboard: () => call<Dashboard>('/dashboard'),
  packs: () => call<PackSummary[]>('/packs'),
  buildPack: (episodeId: number) => call<PackSummary>(`/episodes/${episodeId}/pack`, { method: 'POST' }),
  calls: () => call<CallSummary[]>('/ivr/calls'),
  queueCall: (classroom_id: string, student_ref: string, episode_slug: string) =>
    call<CallSummary>('/ivr/calls', { method: 'POST', body: JSON.stringify({ classroom_id, student_ref, episode_slug }) }),
  startCall: (id: number) => call<CallStep>(`/ivr/calls/${id}/start`, { method: 'POST' }),
  /** Rings a real phone through Exotel. The number is used once by the server and not stored. */
  dial: (id: number, phone: string) => call<CallSummary>(`/ivr/calls/${id}/dial`, { method: 'POST', body: JSON.stringify({ phone }) }),
  /** `digit` is "0" to "9", "*" or "#"; null means nothing was pressed in time. */
  press: (id: number, digit: string | null) =>
    call<CallStep>(`/ivr/calls/${id}/press`, { method: 'POST', body: JSON.stringify({ digit }) }),
}

/** Fetches call audio with the login token and returns a URL an <audio> element can play. */
export async function fetchAudio(path: string): Promise<string> {
  const token = session.get()
  const origin = BASE.replace(/\/api\/v1$/, '')
  let res: Response
  try {
    res = await fetch(origin + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError('Cannot reach the Sahpaathi server. Check the internet connection.', 0)
  }
  if (!res.ok) throw new ApiError(`The server answered ${res.status}.`, res.status)
  return URL.createObjectURL(await res.blob())
}

/** Downloads a pack with the login token (a plain link cannot send it) and saves it as a file. */
export async function downloadPack(pack: PackSummary): Promise<void> {
  const token = session.get()
  let res: Response
  try {
    res = await fetch(`${BASE}/packs/${pack.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError('Cannot reach the Sahpaathi server. Check the internet connection.', 0)
  }
  if (!res.ok) throw new ApiError(`The server answered ${res.status}.`, res.status)
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: packFilename(res.headers.get('Content-Disposition'), pack.id),
  })
  a.click()
  URL.revokeObjectURL(url)
}

export type { Summary }
