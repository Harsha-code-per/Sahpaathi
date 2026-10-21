import { useCallback, useEffect, useRef, useState } from 'react'
import { BASE } from '../studio/api'
import { clamp, faceDelta, makeBaseline, NoiseTracker, poseDelta, type Baseline, type RawFace, type RawPose } from './features'
import { uuid } from '@/lib/utils'
import { loadVision, type Vision } from './vision'

export type Signal = 'confused' | 'distracted' | 'noisy' | 'tired' | 'uncomfortable'
export interface Insight {
  state: Signal | 'focused'
  confidence: number
  scores: Record<string, number>
  reasons: string[]
  check_in: boolean
  features: Record<string, number>
}
/** What the lesson tells the agents, so they weigh a frown against a missed question. */
export interface SenseContext {
  mode: string
  misses: number
  latency_s: number | null
  fillers: number
  silence_s: number
  teacher_speaking: boolean
}
type Status = 'off' | 'starting' | 'on' | 'error'

const CALIBRATE = 8 // seconds of calm that set this learner's baseline
const WINDOW = 15 // seconds of samples the agents look at
const SEND_EVERY = 4000
const COOLDOWN_MS = 90_000 // never check in more than once in a minute and a half
const MAX_CHECK_INS = 5 // per session
const STREAK = 2 // the same signal in this many reports in a row, so a moment never triggers anything

/** What this device keeps, in memory only, and deletes: labelled numbers the learner chose to save. */
export const RETENTION_MS = 30 * 60 * 1000

interface Row {
  features: Record<string, number>
  label: 'got_it' | 'confused'
  at: number
}

/**
 * Turns the learner's camera and microphone into numbers on their own device, asks the server's
 * perception agents what they add up to, and calls `onCheckIn` when the teacher should gently ask
 * "is everything okay?". No image or sound is sent or stored. The only record is the learner's own
 * list of labelled windows, which they can download and which never leaves the browser.
 */
export function useSense(opts: { getContext: () => SenseContext; onCheckIn: (i: Insight) => void; getSpeaking: () => boolean }) {
  const [status, setStatus] = useState<Status>('off')
  const [error, setError] = useState('')
  const [insight, setInsight] = useState<Insight | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [saved, setSaved] = useState(0)
  const live = useRef<{ stop: () => void } | null>(null)
  const rows = useRef<Row[]>([])
  // A random id for this sitting, so a trained model can be tested on people it has not seen. It
  // identifies nobody and is not stored anywhere.
  const [session] = useState(uuid) // once per mount, not on every render
  const latest = useRef<Insight | null>(null)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  /** Deletes everything this device kept: the saved moments and the latest reading. */
  const deleteNow = useCallback(() => {
    rows.current = []
    latest.current = null
    setSaved(0)
  }, [])

  const stop = useCallback(() => {
    deleteNow() // stopping deletes it all, as the consent card promised
    live.current?.stop()
    live.current = null
    setStream(null)
    setStatus('off')
    setInsight(null)
  }, [deleteNow])
  useEffect(() => stop, [stop])
  // Nothing is kept longer than RETENTION_MS, even if the learner forgets to press Stop.
  useEffect(() => {
    const sweep = setInterval(() => {
      const keep = rows.current.filter((r) => Date.now() - r.at < RETENTION_MS)
      if (keep.length !== rows.current.length) {
        rows.current = keep
        setSaved(keep.length)
      }
    }, 30_000)
    return () => clearInterval(sweep)
  }, [])

  const start = useCallback(async () => {
    setStatus('starting')
    setError('')
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user', frameRate: 15 },
        // Noise suppression stays off, or the browser would hide the very noise we want to notice.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      })
    } catch {
      setStatus('error')
      return setError('Camera and microphone were not allowed, so the teacher cannot notice how you are doing. You can still learn without it.')
    }
    setStream(media)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = media
    await video.play().catch(() => undefined)

    const audio = new AudioContext()
    await audio.resume().catch(() => undefined)
    const analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    if (media.getAudioTracks().length) audio.createMediaStreamSource(media).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const loudness = () => {
      analyser.getFloatTimeDomainData(buf)
      return clamp(Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length) * 6)
    }
    const noise = new NoiseTracker()
    let peak = 0 // loudest reading this second
    const quick = setInterval(() => {
      const l = loudness()
      peak = Math.max(peak, l)
      if (!optsRef.current.getSpeaking()) noise.addQuiet(l)
    }, 250)

    let vision: Vision | null = null
    try {
      vision = await loadVision()
    } catch {
      // No models (offline or blocked): sound-only sensing still works.
      setError('The face and posture models could not load, so only sound and answers are used.')
    }

    const faces: RawFace[] = []
    const poses: RawPose[] = []
    let base: Baseline | null = null
    const window: { t: number; face: unknown; pose: unknown; audio: unknown }[] = []
    const t0 = performance.now()
    let streak = { state: 'focused', n: 0 }
    let lastCheckIn = performance.now() - COOLDOWN_MS + 30_000 // the first check-in may come after 30 s
    let checkIns = 0
    let sending = false

    const tick = () => {
      const t = (performance.now() - t0) / 1000
      const speaking = optsRef.current.getSpeaking()
      let face = null
      let pose = null
      if (vision && video.readyState >= 2) {
        const raw = vision.read(video)
        if (!base) {
          if (raw.face) faces.push(raw.face)
          if (raw.pose) poses.push(raw.pose)
          if (t >= CALIBRATE) base = makeBaseline(faces, poses)
        } else {
          face = raw.face ? faceDelta(raw.face, base.face) : null
          pose = raw.pose ? poseDelta(raw.pose, base.pose) : null
        }
      }
      const audioSample = { level: peak, noise: speaking ? 0 : noise.excess(peak), speaking }
      peak = 0
      if (!base && vision) return // still learning what calm looks like for this person
      window.push({ t, face, pose, audio: audioSample })
      if (window.length > WINDOW) window.shift()
    }
    const ticker = setInterval(tick, 1000)

    const send = async () => {
      if (sending || window.length < 3) return
      sending = true
      try {
        const res = await fetch(`${BASE}/tutor/sense`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ samples: window, context: optsRef.current.getContext() }),
        })
        if (!res.ok) return
        const got = (await res.json()) as Insight
        latest.current = got
        setInsight(got)
        streak = got.check_in && got.state === streak.state ? { state: got.state, n: streak.n + 1 } : { state: got.check_in ? got.state : 'focused', n: got.check_in ? 1 : 0 }
        const now = performance.now()
        if (got.check_in && streak.n >= STREAK && now - lastCheckIn > COOLDOWN_MS && checkIns < MAX_CHECK_INS) {
          lastCheckIn = now
          checkIns++
          optsRef.current.onCheckIn(got)
        }
      } catch {
        // offline for a moment: the next report will try again
      } finally {
        sending = false
      }
    }
    const sender = setInterval(send, SEND_EVERY)

    live.current = {
      stop: () => {
        clearInterval(quick)
        clearInterval(ticker)
        clearInterval(sender)
        vision?.close()
        media.getTracks().forEach((tr) => tr.stop())
        void audio.close()
      },
    }
    setStatus('on')
  }, [])

  /** The learner says how they really feel; this window plus its label is kept (in memory only) to train a better model later. */
  const label = useCallback((l: Row['label']) => {
    if (!latest.current) return
    rows.current.push({ features: latest.current.features, label: l, at: Date.now() })
    setSaved(rows.current.length)
  }, [])

  const exportCsv = useCallback(() => {
    if (!rows.current.length) return
    const cols = Object.keys(rows.current[0].features)
    const csv = [['session', ...cols, 'label'].join(','), ...rows.current.map((r) => [session, ...cols.map((c) => r.features[c]), r.label].join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'my-sense-session.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [session])

  return { status, error, insight, stream, saved, start, stop, label, exportCsv, deleteNow }
}
