import {
  ChevronLeftIcon,
  EyeIcon,
  LightbulbIcon,
  MicIcon,
  PartyPopperIcon,
  PauseIcon,
  PlayIcon,
  BellRingIcon,
  Repeat2Icon,
  RotateCcwIcon,
  SettingsIcon,
  SkipForwardIcon,
  Volume2Icon,
} from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Episode, Line, Tap } from '../lib/types'
import Attendance from '../attendance/Attendance'
import './teacher.css'
import LessonPrep from './LessonPrep'
import { CHECKPOINT_TIMEOUT_SEC, advance, analogy, currentLine, start, tap, upcoming, type Phase } from './player'
import { recordTap } from '../sync/outbox'
import LessonFeedback from './LessonFeedback'
import { useChoralHint } from '../sensing/useChoralHint'
import { SyncBadge } from './Library'
import { useT } from './i18n'
import { DEFAULT_PREFS, ROOM_SETTINGS, lineSeconds, loadPrefs, pauseSeconds, roomFromDb, savePrefs, type Prefs, type Room } from './prefs'
import { measureRoomDb } from './roomCheck'
import { ringBell } from './bell'
import { loadSpot, saveSpot } from './resume'

/**
 * Plays one line (audio, else timed text), waits its pause, then calls onDone once. Returns a cancel function.
 * `onPause(true/false)` brackets the silent pause after real audio, when children answer (the choral mic listens then).
 * Speed, pause length and voice boost come from the teacher's settings.
 */
function playLine(line: Line, url: string | undefined, prefs: Prefs, onDone: () => void, onPause: (on: boolean) => void) {
  let timer: number | undefined
  let finished = false
  let ctx: AudioContext | undefined
  const wait = (sec: number) => {
    if (finished) return
    finished = true
    timer = window.setTimeout(
      () => {
        onPause(false)
        onDone()
      },
      (sec + pauseSeconds(line.pause_after_sec, prefs)) * 1000,
    )
  }
  const textSec = lineSeconds(line.text.length, prefs)
  if (!url) {
    wait(textSec)
    return () => clearTimeout(timer)
  }
  const el = new Audio(url)
  el.playbackRate = prefs.rate
  if (prefs.boost > 1) {
    // A gain above 1 makes the voice louder than the phone's own maximum, for the back of a noisy room.
    try {
      ctx = new AudioContext()
      const gain = ctx.createGain()
      gain.gain.value = prefs.boost
      ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination)
    } catch {
      /* the plain audio still plays */
    }
  }
  el.onended = () => {
    if (line.pause_after_sec > 0) onPause(true)
    wait(0)
  }
  el.onerror = () => wait(textSec)
  el.play().catch(() => wait(textSec))
  return () => {
    el.onended = el.onerror = null
    el.pause()
    ctx?.close().catch(() => {})
    clearTimeout(timer)
    onPause(false)
  }
}

// Most first, as on the planning card; each says which branch it plays. Colour is never the only cue.
const TAPS: { tap: Tap; colour: string }[] = [
  { tap: 'most', colour: 'bg-most text-[#0d2420]' },
  { tap: 'some', colour: 'bg-some text-[#172524]' },
  { tap: 'few', colour: 'bg-few text-[#1a0f0b]' },
]

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
  const { t } = useT()
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
          <MicIcon className="size-5" aria-hidden /> {t.heard(t.taps[suggested])}
        </p>
      )}
      {TAPS.map((b) => (
        <button
          key={b.tap}
          className={cn(
            'press flex min-h-18 flex-col items-start justify-center gap-0.5 rounded-2xl px-6 py-3 text-left shadow-[0_12px_24px_-14px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.35)] outline-none focus-visible:ring-4 focus-visible:ring-foreground',
            b.colour,
            b.tap === suggested && 'ring-4 ring-foreground',
          )}
          onClick={() => answer(b.tap, false)}
        >
          <span className="text-2xl leading-tight font-bold">{t.taps[b.tap]}</span>
          <span className="text-base font-semibold opacity-80">→ {t.then[b.tap]}</span>
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
        {t.noTap(secondsLeft)}
      </p>
    </section>
  )
}

const TEXT_SIZE = { m: 'text-[2rem]', l: 'text-[2.5rem]', xl: 'text-[3rem]' } as const

/** A row of choices, one pressed; big targets, no sliders, readable at arm's length. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  names,
  onPick,
}: {
  label: string
  value: T
  options: readonly T[]
  names: Record<T, string>
  onPick: (v: T) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className="grid auto-cols-fr grid-flow-col gap-2" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(o)}
            className={cn(
              'min-h-12 rounded-xl border px-2 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === o ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
            )}
          >
            {names[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

function SettingsPanel({ prefs, onChange }: { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }) {
  const { t } = useT()
  return (
    <section aria-label={t.settings} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <Choice label={t.speed} value={prefs.rate} options={[0.8, 1, 1.25] as const} names={t.speeds} onPick={(rate) => onChange({ rate })} />
      <Choice label={t.answerTime} value={prefs.answer} options={[1, 1.5, 2] as const} names={t.answerTimes} onPick={(answer) => onChange({ answer })} />
      <Choice label={t.voiceBoost} value={prefs.boost} options={[1, 1.5, 2] as const} names={t.boosts} onPick={(boost) => onChange({ boost })} />
      <Choice label={t.textSize} value={prefs.text} options={['m', 'l', 'xl'] as const} names={t.textSizes} onPick={(text) => onChange({ text })} />
      <button type="button" className="text-sm text-muted-foreground underline" onClick={() => onChange(DEFAULT_PREFS)}>
        ↺ {t.resetSettings}
      </button>
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
  const { t } = useT()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const line = currentLine(episode, phase)
  const choral = useChoralHint()
  const { startAnswer, stopAnswer, resetAnswer, takeHint } = choral
  const [suggested, setSuggested] = useState<Tap | null>(null)
  const [paused, setPaused] = useState(false)
  const [tapsNow, setTapsNow] = useState<Tap[]>([]) // deliberate answers this play, for the end summary
  const [spot] = useState(() => loadSpot(episode.id, episode.segments.length))
  const [replays, setReplays] = useState(0) // bumping this restarts the current line
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [showSettings, setShowSettings] = useState(false)
  const [room, setRoom] = useState<Room | 'listening' | 'denied' | null>(null)
  const change = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      savePrefs(next)
      return next
    })
  const checkRoom = async () => {
    setRoom('listening')
    const db = await measureRoomDb()
    if (db === null) return setRoom('denied')
    const r = roomFromDb(db)
    setRoom(r)
    change(ROOM_SETTINGS[r])
  }
  const playing = phase.kind !== 'idle' && phase.kind !== 'done'
  useEffect(() => saveSpot(episode.id, phase), [episode.id, phase])

  // A phone that sleeps mid-lesson stops the audio, so keep the screen on while a lesson runs.
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    const ask = () =>
      navigator.wakeLock.request('screen').then(
        (l) => (lock = l),
        () => {},
      )
    ask()
    const again = () => document.visibilityState === 'visible' && ask() // the lock is released when the tab is hidden
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      lock?.release().catch(() => {})
    }
  }, [playing])

  useEffect(() => {
    if (!line || paused) return
    const onPause = (on: boolean) => (on ? startAnswer() : stopAnswer())
    return playLine(line, audio[line.id], prefs, () => setPhase((p) => advance(episode, p)), onPause)
  }, [line, audio, episode, startAnswer, stopAnswer, paused, prefs, replays])

  // Warm the audio that could play next (the following line, or all three branches at a checkpoint)
  // so a tap or a line change starts at once instead of waiting on the phone to load the file.
  const warm = useRef<HTMLAudioElement[]>([])
  useEffect(() => {
    warm.current = upcoming(episode, phase).flatMap((l) => {
      const url = audio[l.id]
      if (!url) return []
      const el = new Audio(url)
      el.preload = 'auto'
      return [el]
    })
  }, [phase, episode, audio])

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
    if (!auto) setTapsNow((x) => [...x, t])
    // The lesson never waits on storage: a failed write is logged, not shown mid-class.
    recordTap({ episode_id: episode.id, segment_id: segmentId, tap: t, auto }).then(onTapRecorded, (e) => console.error('Could not queue tap', e))
  }

  const KINDS = ['most', 'some', 'few'] as const
  const count = (k: Tap) => tapsNow.filter((x) => x === k).length

  const segment = phase.kind === 'line' || phase.kind === 'checkpoint' ? episode.segments[phase.seg] : null

  const segIndex = segment ? episode.segments.indexOf(segment) : -1

  return (
    <main className="theme-board board-bg min-h-dvh text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-5">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" className="-ml-3 text-muted-foreground" onClick={() => (!playing || confirm(t.confirmExit)) && onExit()}>
              <ChevronLeftIcon aria-hidden /> {t.lessons}
            </Button>
            <div className="flex items-center gap-2">
              <SyncBadge pending={pending} />
              {playing && (
                <button
                  type="button"
                  aria-label={t.bell}
                  onClick={ringBell}
                  className="press grid size-11 place-items-center rounded-full border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BellRingIcon className="size-5" aria-hidden />
                </button>
              )}
              <button
                type="button"
                aria-label={t.settings}
                aria-expanded={showSettings}
                onClick={() => setShowSettings((v) => !v)}
                className={cn(
                  'grid size-11 place-items-center rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  showSettings ? 'bg-primary text-primary-foreground' : 'bg-card',
                )}
              >
                <SettingsIcon className="size-5" aria-hidden />
              </button>
            </div>
          </div>
          {showSettings && <SettingsPanel prefs={prefs} onChange={change} />}
          <h1 className="font-heading text-2xl leading-tight font-bold" lang={episode.school_lang}>
            {episode.title}
          </h1>
          <p className="text-muted-foreground">{t.lessonMeta(episode.grade, episode.district, episode.duration_min)}</p>
          {segment && (
            <div className="space-y-2">
              <div className="flex gap-1.5" aria-hidden>
                {episode.segments.map((s, i) => (
                  <span key={s.id} className={cn('h-2 flex-1 rounded-full transition-colors', i <= segIndex ? 'bg-primary shadow-[0_0_10px_rgb(244_178_62/0.6)]' : 'bg-border')} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {t.partOf(segIndex + 1, episode.segments.length)} · <span lang={episode.school_lang}>{segment.title}</span>
              </p>
            </div>
          )}
        </header>

        {phase.kind === 'idle' && (
          <LessonPrep
            episode={episode}
            onStart={() => setPhase(start(episode))}
            beforeStart={
              <div className="flex flex-col gap-3">
                {spot && (
                  <Button size="lg" className="h-14" onClick={() => setPhase(spot)}>
                    <PlayIcon aria-hidden /> {t.continueFrom('seg' in spot ? spot.seg + 1 : 1)}
                  </Button>
                )}
                <Button variant="outline" size="lg" disabled={choral.state === 'starting' || choral.state === 'on'} onClick={choral.enable}>
                  <MicIcon aria-hidden />
                  {t.mic[choral.state]}
                </Button>
                <Button variant="outline" size="lg" disabled={room === 'listening'} onClick={checkRoom}>
                  <Volume2Icon aria-hidden />
                  {room === 'listening' ? t.roomListening : t.roomCheck}
                </Button>
                {room && room !== 'listening' && (
                  <p role="status" className="rounded-2xl bg-warn p-4 text-warn-foreground">
                    {room === 'denied' ? t.roomDenied : t.roomResult[room]}
                  </p>
                )}
              </div>
            }
          />
        )}

        {(phase.kind === 'line' || phase.kind === 'analogy') && line && (
          <section className="flex flex-1 flex-col gap-4">
            <div key={line.id} className="chalk-line animate-in fade-in slide-in-from-bottom-3 space-y-3 rounded-3xl p-5 duration-500">
              <span className="inline-block rounded-full bg-accent px-3 py-1 text-sm font-semibold">{phase.kind === 'analogy' ? t.analogyPart : t.parts[phase.part]}</span>
              <p lang={line.lang} className={cn('leading-snug font-semibold', TEXT_SIZE[prefs.text])}>
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
          <Checkpoint key={phase.seg} question={segment.checkpoint} suggested={suggested} onTap={(t, auto) => onTap(segment.id, t, auto)} />
        )}

        {paused && (
          <p role="status" className="rounded-2xl bg-warn p-4 text-lg text-warn-foreground">
            {t.pausedNote}
          </p>
        )}

        {(phase.kind === 'line' || phase.kind === 'analogy') && (
          <div className="mt-auto flex flex-col gap-3">
            <Button variant={paused ? 'default' : 'outline'} size="lg" className="h-14 text-lg" onClick={() => setPaused((v) => !v)}>
              {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />} {paused ? t.resume : t.pause}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={() => (setPaused(false), setReplays((n) => n + 1))}>
                <Repeat2Icon aria-hidden /> {t.replayLine}
              </Button>
              <Button variant="outline" size="lg" onClick={() => (setPaused(false), setPhase((p) => advance(episode, p)))}>
                <SkipForwardIcon aria-hidden /> {t.skipLine}
              </Button>
            </div>
          </div>
        )}

        {(phase.kind === 'line' || phase.kind === 'checkpoint') && episode.analogy.length > 0 && (
          <Button variant="outline" size="lg" className={phase.kind === 'checkpoint' ? 'mt-auto' : undefined} onClick={() => setPhase((p) => analogy(episode, p))}>
            <LightbulbIcon className="text-primary" aria-hidden /> {t.needAnalogy}
          </Button>
        )}

        {phase.kind === 'done' && (
          <section className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ok text-ok-foreground">
                <PartyPopperIcon className="size-7" aria-hidden />
              </span>
              <h2 className="font-heading text-2xl font-bold">{t.finished}</h2>
            </div>
            <section aria-label={t.summaryTitle} className="slate-card space-y-3 rounded-2xl p-4">
              <h3 className="font-heading text-lg font-bold">{t.summaryTitle}</h3>
              {tapsNow.length === 0 ? (
                <p className="text-muted-foreground">{t.summaryNone}</p>
              ) : (
                <>
                  <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={KINDS.map((k) => `${t.taps[k]} ${count(k)}`).join(', ')}>
                    {KINDS.map((k) => (
                      <span key={k} className={cn(k === 'most' ? 'bg-most' : k === 'some' ? 'bg-some' : 'bg-few')} style={{ width: `${(100 * count(k)) / tapsNow.length}%` }} />
                    ))}
                  </div>
                  <p className="flex flex-wrap gap-x-4 text-sm">
                    {KINDS.map((k) => (
                      <span key={k}>
                        {t.taps[k]} · <b>{count(k)}</b>
                      </span>
                    ))}
                  </p>
                </>
              )}
            </section>
            <Attendance episodeId={episode.id} onSaved={onTapRecorded} />
            <LessonFeedback episodeId={episode.id} onSaved={onTapRecorded} />
            <Button variant="ghost" size="lg" onClick={() => (setTapsNow([]), setPhase(start(episode)))}>
              <RotateCcwIcon aria-hidden /> {t.playAgain}
            </Button>
          </section>
        )}
      </div>
    </main>
  )
}
