import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Episode, Line, Tap } from '../lib/types'
import LessonPrep from './LessonPrep'
import { CHECKPOINT_TIMEOUT_SEC, advance, analogy, currentLine, start, tap, type Phase } from './player'
import { recordTap } from '../sync/outbox'
import { useChoralHint } from '../sensing/useChoralHint'

/** Seconds a line stays on screen when it has no audio yet. */
function estimateSec(line: Line) {
  return Math.max(2, line.text.length * 0.07)
}

/**
 * Plays one line (audio, else timed text), waits its pause, then calls onDone once. Returns a cancel function.
 * `onPause(true/false)` brackets the silent pause after real audio, when children answer (the choral mic listens then).
 */
function playLine(line: Line, url: string | undefined, onDone: () => void, onPause: (on: boolean) => void) {
  let timer: number | undefined
  let finished = false
  const wait = (sec: number) => {
    if (finished) return
    finished = true
    timer = window.setTimeout(() => {
      onPause(false)
      onDone()
    }, (sec + line.pause_after_sec) * 1000)
  }
  if (!url) {
    wait(estimateSec(line))
    return () => clearTimeout(timer)
  }
  const el = new Audio(url)
  el.onended = () => {
    if (line.pause_after_sec > 0) onPause(true)
    wait(0)
  }
  el.onerror = () => wait(estimateSec(line))
  el.play().catch(() => wait(estimateSec(line)))
  return () => {
    el.onended = el.onerror = null
    el.pause()
    clearTimeout(timer)
    onPause(false)
  }
}

const TAPS: { tap: Tap; label: string; colour: string }[] = [
  { tap: 'few', label: 'Few got it', colour: 'bg-clay' },
  { tap: 'some', label: 'Some got it', colour: 'bg-sun text-ink' },
  { tap: 'most', label: 'Most got it', colour: 'bg-leaf' },
]

const PART_LABEL = { teach: 'Teach', easier: 'Easier', core: 'Core', stretch: 'Stretch' }

/** Three big tap buttons; mounted fresh per segment so the 10 s countdown restarts. Answers at most once. */
function Checkpoint({
  question,
  suggested,
  onTap,
}: {
  question: string
  /** What the choral mic heard: a hint only, the teacher decides. */
  suggested: Tap | null
  onTap: (t: Tap, auto: boolean) => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(CHECKPOINT_TIMEOUT_SEC)
  const answered = useRef(false)
  const answer = (t: Tap, auto: boolean) => {
    if (answered.current) return
    answered.current = true
    onTap(t, auto)
  }
  const fallback = useEffectEvent(() => answer('some', true))

  useEffect(() => {
    const deadline = Date.now() + CHECKPOINT_TIMEOUT_SEC * 1000
    const id = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      if (left > 0) return setSecondsLeft(left)
      clearInterval(id)
      fallback()
    }, 250)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="flex flex-1 flex-col gap-4">
      <p className="text-3xl font-semibold">{question}</p>
      {suggested && <p className="text-lg text-sun">🎤 The speaker heard: {TAPS.find((t) => t.tap === suggested)?.label}</p>}
      {TAPS.map((t) => (
        <button
          key={t.tap}
          className={`min-h-20 rounded-2xl text-2xl font-bold ${t.colour} ${t.tap === suggested ? 'ring-4 ring-white' : ''}`}
          onClick={() => answer(t.tap, false)}
        >
          {t.label}
        </button>
      ))}
      <p className="text-center opacity-70">No tap? Core plays in {secondsLeft} s</p>
    </section>
  )
}

interface LessonPlayerProps {
  episode: Episode
  /** line id -> playable URL; lines without one show as timed text. */
  audio: Record<string, string>
  /** Taps waiting to sync, shown in the header. */
  pending: number | null
  /** Called after a tap is safely queued, so the caller can try to send it. */
  onTapRecorded: () => void
  onExit: () => void
}

export default function LessonPlayer({ episode, audio, pending, onTapRecorded, onExit }: LessonPlayerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const line = currentLine(episode, phase)
  const choral = useChoralHint()
  const { startAnswer, stopAnswer, resetAnswer, takeHint } = choral
  const [suggested, setSuggested] = useState<Tap | null>(null)

  useEffect(() => {
    if (!line) return
    const onPause = (on: boolean) => (on ? startAnswer() : stopAnswer())
    return playLine(line, audio[line.id], () => setPhase((p) => advance(episode, p)), onPause)
  }, [line, audio, episode, startAnswer, stopAnswer])

  // A new segment starts with empty ears: pauses from the previous segment's easier/core/stretch
  // lines must not colour this segment's hint.
  const teachStartSeg = phase.kind === 'line' && phase.part === 'teach' && phase.line === 0 ? phase.seg : null
  useEffect(() => {
    if (teachStartSeg !== null) resetAnswer()
  }, [teachStartSeg, resetAnswer])

  // Ask the mic once per checkpoint; the suggestion is cleared as soon as the lesson moves on.
  // Opening the analogy and coming back keeps the hint shown before: the analogy's own pauses
  // are not an answer to the checkpoint question.
  const checkpointSeg = phase.kind === 'checkpoint' ? phase.seg : null
  const hintTakenFor = useRef<number | null>(null)
  useEffect(() => {
    if (phase.kind === 'analogy') return
    if (checkpointSeg === null) {
      hintTakenFor.current = null
      // oxlint-disable-next-line react/set-state-in-effect
      return setSuggested(null)
    }
    if (hintTakenFor.current === checkpointSeg) return
    hintTakenFor.current = checkpointSeg
    // Reading the mic buffer consumes it, so this must run once per checkpoint, not during render.
    // oxlint-disable-next-line react/set-state-in-effect
    setSuggested(takeHint())
  }, [phase.kind, checkpointSeg, takeHint])

  const onTap = (segmentId: string, t: Tap, auto: boolean) => {
    setPhase((p) => tap(episode, p, t))
    // The lesson never waits on storage: a failed write is logged, not shown mid-class.
    recordTap({ episode_id: episode.id, segment_id: segmentId, tap: t, auto }).then(onTapRecorded, (e) =>
      console.error('Could not queue tap', e),
    )
  }

  const segment = phase.kind === 'line' || phase.kind === 'checkpoint' ? episode.segments[phase.seg] : null

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-ink p-6 text-white">
      <header>
        <button className="mb-2 min-h-12 text-lg opacity-80" onClick={onExit}>
          ← Lessons
        </button>
        <h1 className="text-3xl font-bold text-sun">{episode.title}</h1>
        <p className="mt-1 opacity-80">
          Grade {episode.grade} · {episode.district} · {episode.duration_min} min
          {!!pending && <span className="ml-2 text-sm">· ⏳ {pending} to sync</span>}
        </p>
        {segment && (
          <p className="mt-3 text-lg">
            {episode.segments.indexOf(segment) + 1}/{episode.segments.length} · {segment.title}
          </p>
        )}
      </header>

      {phase.kind === 'idle' && (
        <LessonPrep
          episode={episode}
          onStart={() => setPhase(start(episode))}
          beforeStart={
            <button
              className="min-h-14 rounded-2xl border-2 border-white/40 text-xl font-semibold disabled:opacity-60"
              disabled={choral.state === 'starting' || choral.state === 'on'}
              onClick={choral.enable}
            >
              {{ off: '🎤 Let the speaker listen (optional)', starting: '🎤 Listening to the room…', on: '🎤 Listening: on ✓', denied: '🎤 Mic blocked. Tap to try again' }[choral.state]}
            </button>
          }
        />
      )}

      {(phase.kind === 'line' || phase.kind === 'analogy') && line && (
        <section className="flex flex-1 flex-col gap-4">
          <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-sm">
            {phase.kind === 'analogy' ? 'Analogy' : PART_LABEL[phase.part]}
          </span>
          <p lang={line.lang} className="text-4xl leading-snug font-semibold">
            {line.text}
          </p>
          {line.cue && <p className="rounded-xl bg-sun/20 p-4 text-lg text-sun">👀 {line.cue}</p>}
        </section>
      )}

      {phase.kind === 'checkpoint' && segment && (
        <Checkpoint
          key={phase.seg}
          question={segment.checkpoint}
          suggested={suggested}
          onTap={(t, auto) => onTap(segment.id, t, auto)}
        />
      )}

      {(phase.kind === 'line' || phase.kind === 'checkpoint') && episode.analogy.length > 0 && (
        <button
          className="min-h-14 rounded-2xl border-2 border-sun text-xl font-semibold text-sun"
          onClick={() => setPhase((p) => analogy(episode, p))}
        >
          💡 Need a simpler analogy
        </button>
      )}

      {phase.kind === 'done' && (
        <section className="flex flex-1 flex-col gap-4">
          <p className="text-3xl font-semibold text-leaf">Lesson finished 🎉</p>
          <button className="min-h-20 rounded-2xl bg-white/15 text-2xl font-bold" onClick={() => setPhase(start(episode))}>
            ↺ Play again
          </button>
        </section>
      )}
    </main>
  )
}
