import { ApiError, BASE } from '../studio/api'

// Lessons from the Sahpaathi server: sign in once, list the ready packs, download one. Everything here
// needs a signal; the lessons themselves play offline once imported (store.ts verifies the signature).

const TOKEN_KEY = 'sahpaathi.teacher.token'

/** Kept across restarts (unlike the Studio's tab-only login): the phone is the teacher's own. */
export const teacherToken = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t)
    } catch {
      // private mode: the login lasts until the app closes
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // nothing stored
    }
  },
}

export interface RemotePack {
  id: number
  episode_slug: string | null
  title: string | null
  grade: number | null
  district_id: string
  size_bytes: number | null
}

const NO_SIGNAL = 'No signal right now. Lessons already on this phone still work.'

async function send(path: string, init: RequestInit, fetchFn: typeof fetch) {
  let res: Response
  try {
    res = await fetchFn(BASE + path, init)
  } catch {
    throw new ApiError(NO_SIGNAL, 0)
  }
  if (!res.ok && res.status !== 206) {
    const detail = await res.json().then(
      (b) => b.detail,
      () => null,
    )
    throw new ApiError(typeof detail === 'string' ? detail : `The server answered ${res.status}.`, res.status)
  }
  return res
}

export async function signIn(email: string, password: string, fetchFn: typeof fetch = fetch) {
  const res = await send('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, fetchFn)
  const { token } = (await res.json()) as { token: string }
  teacherToken.set(token)
}

export async function listRemotePacks(token: string, fetchFn: typeof fetch = fetch): Promise<RemotePack[]> {
  const res = await send('/packs', { headers: { Authorization: `Bearer ${token}` } }, fetchFn)
  return res.json()
}

/** Tries per download; each retry resumes where the last one stopped. */
export const TRIES = 4

/**
 * Downloads a pack, resuming with a Range request when 2G drops mid-way, so a 1 MB lesson needn't
 * start over. `onProgress` gets 0–1 when the size is known.
 * ponytail: resumes within one visit only; keep the partial bytes in IndexedDB if teachers lose them often.
 */
export async function downloadPack(id: number, token: string, onProgress: (f: number) => void = () => {}, fetchFn: typeof fetch = fetch): Promise<Blob> {
  const parts: Uint8Array[] = []
  let got = 0
  let total: number | null = null
  for (let attempt = 1; ; attempt++) {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (got > 0) headers.Range = `bytes=${got}-`
      const res = await send(`/packs/${id}`, { headers }, fetchFn)
      if (res.status !== 206 && got > 0) {
        // The server sent the whole file again: start over rather than append it.
        parts.length = 0
        got = 0
      }
      total ??= Number(res.headers.get('Content-Range')?.split('/')[1] ?? res.headers.get('Content-Length')) || null
      const reader = res.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        got += value.length
        if (total) onProgress(Math.min(1, got / total))
      }
      if (total === null || got >= total) return new Blob(parts as BlobPart[], { type: 'application/zip' })
      throw new ApiError(NO_SIGNAL, 0) // the stream ended early
    } catch (err) {
      const retriable = err instanceof ApiError ? err.status === 0 : err instanceof TypeError // dropped connection
      if (!retriable || attempt >= TRIES) throw err instanceof ApiError ? err : new ApiError(NO_SIGNAL, 0)
    }
  }
}
