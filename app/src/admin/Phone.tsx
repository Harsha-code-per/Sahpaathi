import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, ApiError, fetchAudio, type CallStep, type CallSummary } from './api'
import { endMessage, KEY_WAIT_SEC, KEYPAD } from './view'

type Phase = 'idle' | 'playing' | 'waiting' | 'sending' | 'ended'

const HINT: Record<Phase, string> = {
  idle: 'Press Dial to ring the family.',
  playing: 'The family hears the recap…',
  waiting: 'Waiting for a key. 1 hear again, 2 child understood, 3 need help.',
  sending: '…',
  ended: '',
}

function playUrl(el: { current: HTMLAudioElement | null }, url: string) {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url)
    el.current = audio
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve()) // a blocked or broken clip must not stall the call
  })
}

/**
 * A keypad phone for one absentee call. It runs exactly what a real phone would: the server says what
 * to play, the "parent" presses 1, 2 or 3 (or nothing), and the server decides what comes next.
 */
export default function Phone({ call, onClose, onSignedOut }: { call: CallSummary; onClose: () => void; onSignedOut: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState<CallStep | null>(null)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(KEY_WAIT_SEC)
  const audio = useRef<HTMLAudioElement | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      // The latest clip is wanted here, not the one from when the effect ran.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      audio.current?.pause()
    }
  }, [])

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
      setError(err instanceof ApiError ? err.message : 'Something went wrong on the call.')
      setPhase('ended')
    },
    [onSignedOut],
  )

  const run = useCallback(
    async (next: CallStep) => {
      setStep(next)
      if (next.hangup) return setPhase('ended')
      setPhase('playing')
      try {
        for (const clip of next.play) {
          const url = await fetchAudio(clip.url)
          if (!alive.current) return
          await playUrl(audio, url)
          URL.revokeObjectURL(url)
          if (!alive.current) return
        }
      } catch (err) {
        return fail(err)
      }
      setSecondsLeft(KEY_WAIT_SEC)
      setPhase('waiting')
    },
    [fail],
  )

  const send = useCallback(
    async (digit: string | null) => {
      setPhase('sending')
      try {
        await run(await adminApi.press(call.id, digit))
      } catch (err) {
        fail(err)
      }
    },
    [call.id, run, fail],
  )

  async function dial() {
    setError('')
    try {
      await run(await adminApi.startCall(call.id))
    } catch (err) {
      fail(err)
    }
  }

  // No key in time counts as "nothing pressed", like a parent who does not answer the menu.
  useEffect(() => {
    if (phase !== 'waiting') return
    const tick = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    const giveUp = window.setTimeout(() => void send(null), KEY_WAIT_SEC * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(giveUp)
    }
  }, [phase, send])

  return (
    <section className="mx-auto w-full max-w-xs space-y-3 rounded-3xl bg-sidebar p-5 text-sidebar-foreground shadow-lg" aria-label="Keypad phone">
      <div className="text-center">
        <p className="text-sm opacity-70">Calling the family of</p>
        <p className="text-xl font-bold">
          Roll {call.student_ref} <span className="font-normal opacity-70">({call.classroom_id})</span>
        </p>
      </div>
      <p className="min-h-12 text-center text-sm" aria-live="polite">
        {phase === 'ended' && step ? endMessage(step.status, step.outcome) : HINT[phase]}
        {phase === 'waiting' && <span className="block text-sidebar-primary">{secondsLeft} s</span>}
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-bad p-2 text-bad-foreground text-sm">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYPAD.flat().map((key) => (
          <button
            key={key}
            disabled={phase !== 'waiting'}
            onClick={() => send(key)}
            className="min-h-14 rounded-xl bg-white/15 text-2xl font-bold hover:bg-white/25 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
          >
            {key}
          </button>
        ))}
      </div>
      {phase === 'idle' && (
        <button
          onClick={dial}
          className="min-h-14 w-full rounded-xl bg-most text-[#0d2420] text-lg font-bold focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
        >
          Dial
        </button>
      )}
      {(phase === 'ended' || phase === 'idle') && (
        <button
          onClick={onClose}
          className="min-h-12 w-full rounded-xl border border-white/30 font-semibold hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
        >
          {phase === 'ended' ? 'Hang up' : 'Cancel'}
        </button>
      )}
    </section>
  )
}
