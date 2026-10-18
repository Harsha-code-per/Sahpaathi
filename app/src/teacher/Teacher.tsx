import { useCallback, useEffect, useState } from 'react'
import type { Line, Tap } from '../lib/types'
import LessonPrep from './LessonPrep'
import { CHECKPOINT_TIMEOUT_SEC, advance, analogy, currentLine, start, tap, type Phase } from './player'
import { samplePack } from './samplePack'

const { episode, audio } = samplePack

/** Seconds a line stays on screen when it has no audio yet. */
function estimateSec(line: Line) {
  return Math.max(2, line.text.length * 0.07)
}

/** Plays one line (audio, else timed text), waits its pause, then calls onDone once. Returns a cancel function. */
function playLine(line: Line, url: string | undefined, onDone: () => void) {
  let timer: number | undefined
  let finished = false
  const wait = (sec: number) => {
    if (finished) return
    finished = true
    timer = window.setTimeout(onDone, (sec + line.pause_after_sec) * 1000)
  }
  if (!url) {
    wait(estimateSec(line))
    return () => clearTimeout(timer)
  }
  const el = new Audio(url)
  el.onended = () => wait(0)
  el.onerror = () => wait(estimateSec(line))
  el.play().catch(() => wait(estimateSec(line)))
  return () => {
    el.onended = el.onerror = null
    el.pause()
    clearTimeout(timer)
  }
}

const TAPS: { tap: Tap; label: string; colour: string }[] = [
  { tap: 'few', label: 'Few got it', colour: 'bg-clay' },
  { tap: 'some', label: 'Some got it', colour: 'bg-sun text-ink' },
  { tap: 'most', label: 'Most got it', colour: 'bg-leaf' },
]

const PART_LABEL = { teach: 'Teach', easier: 'Easier', core: 'Core', stretch: 'Stretch' }

/** Three big tap buttons; mounted fresh per segment so the 10 s countdown restarts. */
function Checkpoint({ question, onTap }: { question: string; onTap: (t: Tap) => void }) {
  const [secondsLeft, setSecondsLeft] = useState(CHECKPOINT_TIMEOUT_SEC)

  useEffect(() => {
    const deadline = Date.now() + CHECKPOINT_TIMEOUT_SEC * 1000
    const id = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      if (left > 0) return setSecondsLeft(left)
      clearInterval(id)
      onTap('some')
    }, 250)
    return () => clearInterval(id)
  }, [onTap])

  return (
    <section className="flex flex-1 flex-col gap-4">
      <p className="text-3xl font-semibold">{question}</p>
      {TAPS.map((t) => (
        <button key={t.tap} className={`min-h-20 rounded-2xl text-2xl font-bold ${t.colour}`} onClick={() => onTap(t.tap)}>
          {t.label}
        </button>
      ))}
      <p className="text-center opacity-70">No tap? Core plays in {secondsLeft} s</p>
    </section>
  )
}

export default function Teacher() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const line = currentLine(episode, phase)

  useEffect(() => {
    if (!line) return
    return playLine(line, audio[line.id], () => setPhase((p) => advance(episode, p)))
  }, [line])

  const onTap = useCallback((t: Tap) => setPhase((p) => tap(episode, p, t)), [])

  const segment = phase.kind === 'line' || phase.kind === 'checkpoint' ? episode.segments[phase.seg] : null

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-ink p-6 text-white">
      <header>
        <h1 className="text-3xl font-bold text-sun">{episode.title}</h1>
        <p className="mt-1 opacity-80">
          Grade {episode.grade} · {episode.district} · {episode.duration_min} min
        </p>
        {segment && (
          <p className="mt-3 text-lg">
            {episode.segments.indexOf(segment) + 1}/{episode.segments.length} · {segment.title}
          </p>
        )}
      </header>

      {phase.kind === 'idle' && <LessonPrep episode={episode} onStart={() => setPhase(start(episode))} />}

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
        <Checkpoint key={phase.seg} question={segment.checkpoint} onTap={onTap} />
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
