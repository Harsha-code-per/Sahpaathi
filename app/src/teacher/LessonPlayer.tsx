import { ChevronLeftIcon, EyeIcon, LightbulbIcon, MicIcon, PartyPopperIcon, RotateCcwIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Episode, Line, Tap } from '../lib/types'
import Attendance from '../attendance/Attendance'
import LessonPrep from './LessonPrep'
import { CHECKPOINT_TIMEOUT_SEC, advance, analogy, currentLine, start, tap, type Phase } from './player'
import { recordTap } from '../sync/outbox'
import { useChoralHint } from '../sensing/useChoralHint'
import { SyncBadge } from './Library'

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

// Most first, as on the planning card; each says which branch it plays. Colour is never the only cue.
const TAPS: { tap: Tap; label: string; then: string; colour: string }[] = [
  { tap: 'most', label: 'Most got it', then: 'stretch', colour: 'bg-most text-[#0d2420]' },
  { tap: 'some', label: 'Some got it', then: 'more practice', colour: 'bg-some text-[#172524]' },
  { tap: 'few', label: 'Few got it', then: 'easier', colour: 'bg-few text-[#1a0f0b]' },
]

const PART_LABEL = { teach: 'Teach', easier: 'Easier', core: 'More practice', stretch: 'Stretch' }

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

  const ring = 2 * Math.PI * 11
  return (
    <section className="flex flex-1 flex-col gap-3">
      <h2 className="font-heading text-[1.75rem] leading-tight font-bold">{question}</h2>
      {suggested && (
        <p className="flex items-center gap-2 text-lg text-primary">
          <MicIcon className="size-5" aria-hidden /> The speaker heard: {TAPS.find((t) => t.tap === suggested)?.label}
        </p>
      )}
      {TAPS.map((t) => (
        <button
          key={t.tap}
          className={cn(
            'flex min-h-18 items-center justify-between gap-3 rounded-2xl px-6 text-left text-2xl font-bold outline-none focus-visible:ring-4 focus-visible:ring-foreground',
            t.colour,
            t.tap === suggested && 'ring-4 ring-foreground',
          )}
          onClick={() => answer(t.tap, false)}
        >
          {t.label} <span className="text-base font-semibold opacity-80">{t.then}</span>
        </button>
      ))}
      <p className="flex items-center justify-center gap-3 text-muted-foreground" aria-live="polite">
        <svg viewBox="0 0 28 28" className="size-7 -rotate-90" aria-hidden>
          <circle cx="14" cy="14" r="11" fill="none" strokeWidth="3" className="stroke-border" />
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-300"
            strokeDasharray={ring}
            strokeDashoffset={ring * (1 - secondsLeft / CHECKPOINT_TIMEOUT_SEC)}
          />
        </svg>
        No tap? More practice plays in {secondsLeft} s
      </p>
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

  const segIndex = segment ? episode.segments.indexOf(segment) : -1

  return (
    <main className="theme-board min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-5">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" className="-ml-3 text-muted-foreground" onClick={onExit}>
              <ChevronLeftIcon aria-hidden /> Lessons
            </Button>
            <SyncBadge pending={pending} />
          </div>
          <h1 className="font-heading text-2xl leading-tight font-bold" lang={episode.school_lang}>
            {episode.title}
          </h1>
          <p className="text-muted-foreground">
            Grade {episode.grade} · {episode.district} · {episode.duration_min} min
          </p>
          {segment && (
            <div className="space-y-2">
              <div className="flex gap-1.5" aria-hidden>
                {episode.segments.map((s, i) => (
                  <span key={s.id} className={cn('h-1.5 flex-1 rounded-full', i <= segIndex ? 'bg-primary' : 'bg-border')} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Part {segIndex + 1} of {episode.segments.length} · <span lang={episode.school_lang}>{segment.title}</span>
              </p>
            </div>
          )}
        </header>

        {phase.kind === 'idle' && (
          <LessonPrep
            episode={episode}
            onStart={() => setPhase(start(episode))}
            beforeStart={
              <Button
                variant="outline"
                size="lg"
                disabled={choral.state === 'starting' || choral.state === 'on'}
                onClick={choral.enable}
              >
                <MicIcon aria-hidden />
                {{ off: 'Let the speaker listen (optional)', starting: 'Listening to the room…', on: 'Listening: on', denied: 'Mic blocked. Tap to try again' }[choral.state]}
              </Button>
            }
          />
        )}

        {(phase.kind === 'line' || phase.kind === 'analogy') && line && (
          <section className="flex flex-1 flex-col gap-4">
            <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
              <span className="inline-block rounded-full bg-accent px-3 py-1 text-sm font-semibold">
                {phase.kind === 'analogy' ? 'Simpler analogy' : PART_LABEL[phase.part]}
              </span>
              <p lang={line.lang} className="text-[2rem] leading-snug font-semibold">
                {line.text}
              </p>
            </div>
            {line.cue && (
              <p className="flex gap-3 rounded-2xl bg-warn p-4 text-lg text-warn-foreground">
                <EyeIcon className="mt-1 size-5 shrink-0" aria-hidden /> {line.cue}
              </p>
            )}
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
          <Button variant="outline" size="lg" className="mt-auto" onClick={() => setPhase((p) => analogy(episode, p))}>
            <LightbulbIcon className="text-primary" aria-hidden /> Need a simpler analogy
          </Button>
        )}

        {phase.kind === 'done' && (
          <section className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ok text-ok-foreground">
                <PartyPopperIcon className="size-7" aria-hidden />
              </span>
              <h2 className="font-heading text-2xl font-bold">Lesson finished</h2>
            </div>
            <Attendance episodeId={episode.id} onSaved={onTapRecorded} />
            <Button variant="ghost" size="lg" onClick={() => setPhase(start(episode))}>
              <RotateCcwIcon aria-hidden /> Play again
            </Button>
          </section>
        )}
      </div>
    </main>
  )
}
