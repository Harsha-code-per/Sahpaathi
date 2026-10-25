import { ApiError, BASE } from '../studio/api'
import { teacherToken } from '../packs/remote'
import { getDB, type RecordingRecord } from '../storage/db'

// A teacher's own voice recordings of topics. Kept on the phone first, sent when she is signed in and online (the
// server stores it and an AI reviews it), and the review comes back into the same record. Audio never leaves the
// phone unless she presses Send.

/** A recording id: made here so a retried upload is stored once (the server dedupes by it). */
export const newId = () => crypto.randomUUID()

export async function saveRecording(r: RecordingRecord) {
  await (await getDB()).put('recordings', r)
}

export async function listRecordings(): Promise<RecordingRecord[]> {
  return (await (await getDB()).getAll('recordings')).sort((a, b) => b.at.localeCompare(a.at))
}

export async function deleteRecording(id: string) {
  await (await getDB()).delete('recordings', id)
}

/** The newest recording per topic. */
export function latestByTopic(all: RecordingRecord[]): Map<string, RecordingRecord> {
  const m = new Map<string, RecordingRecord>()
  for (const r of [...all].sort((a, b) => a.at.localeCompare(b.at))) m.set(r.episode_id, r)
  return m
}

const NO_SIGNAL = 'No signal right now. Your recording is saved on this phone and can be sent later.'

async function call(path: string, init: RequestInit, fetchFn: typeof fetch) {
  let res: Response
  try {
    res = await fetchFn(BASE + path, init)
  } catch {
    throw new ApiError(NO_SIGNAL, 0)
  }
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null)
    throw new ApiError(typeof detail === 'string' ? detail : `The server answered ${res.status}.`, res.status)
  }
  return res
}

/** Sends one saved recording. A repeat is harmless: the server keeps the first and answers 200. */
export async function sendRecording(r: RecordingRecord, token = teacherToken.get(), fetchFn: typeof fetch = fetch): Promise<RecordingRecord> {
  if (!token) throw new ApiError('Sign in to send your recording.', 401)
  const q = new URLSearchParams({ episode_id: r.episode_id, subject: r.subject, grade: String(r.grade), duration_sec: String(Math.max(1, Math.round(r.duration_sec))), lang: r.lang })
  if (r.classroom_id) q.set('classroom_id', r.classroom_id)
  await call(`/recordings/${r.id}?${q}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': r.mime }, body: r.audio }, fetchFn)
  const sent: RecordingRecord = { ...r, status: r.status === 'saved' ? 'sent' : r.status }
  await saveRecording(sent)
  return sent
}

interface ServerRecording {
  id: string
  status: 'received' | 'reviewed' | 'unreviewed'
  transcript: string | null
  review: RecordingRecord['review']
}

/** Pulls the AI reviews that have finished into the local records. Returns the updated list. */
export async function refreshReviews(token = teacherToken.get(), fetchFn: typeof fetch = fetch): Promise<RecordingRecord[]> {
  const local = await listRecordings()
  if (!token || !local.some((r) => r.status === 'sent')) return local
  const server = (await (await call('/recordings', { headers: { Authorization: `Bearer ${token}` } }, fetchFn)).json()) as ServerRecording[]
  const byId = new Map(server.map((s) => [s.id, s]))
  const out: RecordingRecord[] = []
  for (const r of local) {
    const s = byId.get(r.id)
    if (r.status === 'sent' && s && s.status !== 'received') {
      const next: RecordingRecord = { ...r, status: s.status, transcript: s.transcript, review: s.review }
      await saveRecording(next)
      out.push(next)
    } else out.push(r)
  }
  return out
}

/** Sends every recording still only on the phone. One failure (no signal, not signed in) stops the rest quietly. */
export async function sendPending(token = teacherToken.get(), fetchFn: typeof fetch = fetch): Promise<void> {
  for (const r of (await listRecordings()).filter((x) => x.status === 'saved')) {
    try {
      await sendRecording(r, token, fetchFn)
    } catch {
      return
    }
  }
}

// ---- the microphone ---------------------------------------------------------------------------------------------

const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']

export interface Take {
  blob: Blob
  mime: string
  seconds: number
}

export interface Recorder {
  /** Loudness 0 to 1 right now, for a level meter. */
  level: () => number
  stop: () => Promise<Take>
  cancel: () => void
}

/** Starts recording the microphone with the browser's own noise suppression and echo cancellation on. null if refused. */
export async function startRecorder(): Promise<Recorder | null> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } })
  } catch {
    return null
  }
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)
  const t0 = Date.now()
  rec.start(1000)
  const close = () => {
    stream.getTracks().forEach((t) => t.stop())
    ctx.close().catch(() => {})
  }
  return {
    level() {
      analyser.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      return Math.min(1, peak / 64)
    },
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          close()
          const type = rec.mimeType || mime || 'audio/webm'
          resolve({ blob: new Blob(chunks, { type }), mime: type, seconds: (Date.now() - t0) / 1000 })
        }
        rec.stop()
      }),
    cancel() {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      close()
    },
  }
}
