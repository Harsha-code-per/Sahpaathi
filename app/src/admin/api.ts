import { api as studio, ApiError, BASE, call, session } from '../studio/api'
import type { Summary } from '../studio/api'

// Admin talks to the same backend as the Studio (docs/API.md) and shares its login token.
export { ApiError, session }

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

export interface Dashboard {
  overall: Understanding
  auto_fallbacks: number
  episodes: EpisodeUsage[]
  last_days: Day[]
  episodes_by_status: Record<string, number>
  packs_ready: number
  catchup_calls: null
}

export type PackStatus = 'building' | 'ready' | 'failed'

export interface PackSummary {
  id: number
  episode_id: number
  status: PackStatus
  error: string | null
  size_bytes: number | null
  title: string | null
  grade: number | null
  district_id: string
  created_at: string
}

export const adminApi = {
  login: studio.login,
  episodes: studio.episodes,
  dashboard: () => call<Dashboard>('/dashboard'),
  packs: () => call<PackSummary[]>('/packs'),
  buildPack: (episodeId: number) => call<PackSummary>(`/episodes/${episodeId}/pack`, { method: 'POST' }),
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
  const a = Object.assign(document.createElement('a'), { href: url, download: `${pack.title ?? `pack-${pack.id}`}.sahpaathi` })
  a.click()
  URL.revokeObjectURL(url)
}

export type { Summary }
