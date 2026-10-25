import { CheckCircle2Icon, MicIcon, SquareIcon, Trash2Icon, UploadCloudIcon } from 'lucide-react'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Episode } from '../lib/types'
import { getClassroom } from '../attendance/classroom'
import { signIn, teacherToken } from '../packs/remote'
import type { RecordingRecord } from '../storage/db'
import { useT } from './i18n'
import { newId, saveRecording, sendRecording, startRecorder, type Recorder as Rec, type Take } from './recordings'

const HOME_LANGS = ['ta', 'hi', 'or', 'en'] as const
const field = 'h-14 rounded-xl border border-input bg-background px-4 text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Records one topic in the teacher's own voice: read the lines, record, listen back, then save (and send for the AI review). */
export default function Recorder({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const { t } = useT()
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle')
  const [take, setTake] = useState<Take | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [token, setToken] = useState(teacherToken.get)
  const rec = useRef<Rec | null>(null)

  // The meter and clock tick only while recording.
  useEffect(() => {
    if (phase !== 'recording') return
    const t0 = Date.now()
    const id = window.setInterval(() => {
      setSeconds((Date.now() - t0) / 1000)
      setLevel(rec.current?.level() ?? 0)
    }, 100)
    return () => clearInterval(id)
  }, [phase])
  // Leaving mid-recording must release the microphone.
  useEffect(() => () => rec.current?.cancel(), [])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function start() {
    setBlocked(false)
    setMessage(null)
    const r = await startRecorder()
    if (!r) return setBlocked(true)
    rec.current = r
    setSeconds(0)
    setPhase('recording')
  }

  async function stop() {
    const r = rec.current
    if (!r) return
    rec.current = null
    const done = await r.stop()
    setTake(done)
    setUrl(URL.createObjectURL(done.blob))
    setPhase('review')
  }

  function discard() {
    setTake(null)
    setUrl(null)
    setPhase('idle')
    setMessage(null)
  }

  async function save(send: boolean) {
    if (!take) return
    setBusy(true)
    const room = await getClassroom().catch(() => null)
    const lang = (HOME_LANGS as readonly string[]).includes(episode.home_lang) ? (episode.home_lang as RecordingRecord['lang']) : 'en'
    const record: RecordingRecord = {
      id: newId(),
      episode_id: episode.id,
      subject: episode.subject,
      grade: episode.grade,
      lang,
      ...(room ? { classroom_id: room.classroom_id } : {}),
      duration_sec: take.seconds,
      mime: take.mime,
      audio: take.blob,
      at: new Date().toISOString(),
      status: 'saved',
    }
    await saveRecording(record)
    try {
      if (!send) throw new Error('local only')
      await sendRecording(record)
      setMessage({ ok: true, text: t.recSentOk })
    } catch {
      setMessage({ ok: !send, text: t.recSavedOnly })
    }
    setBusy(false)
    setTimeout(onClose, 1400)
  }

  async function login(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    try {
      await signIn(String(form.get('email')), String(form.get('password')))
      setToken(teacherToken.get())
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t.signInAgain })
    }
  }

  const lines = episode.segments.flatMap((s) => s.teach)

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">{t.recorderTitle}</p>
        <h1 className="font-heading text-2xl leading-tight font-bold" lang={episode.school_lang}>
          {episode.title}
        </h1>
        <p className="text-muted-foreground">{t.recorderIntro}</p>
      </div>

      <ol className="slate-card max-h-64 space-y-2 overflow-y-auto rounded-2xl p-4 text-lg leading-snug" aria-label={episode.title}>
        {lines.map((l) => (
          <li key={l.id} lang={l.lang}>
            {l.text}
          </li>
        ))}
      </ol>

      {phase === 'idle' && (
        <Button size="lg" className="h-16 text-xl" onClick={start}>
          <MicIcon aria-hidden /> {t.recStart}
        </Button>
      )}

      {phase === 'recording' && (
        <div className="slate-card flex flex-col items-center gap-4 rounded-2xl p-5" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span className="size-3 animate-pulse rounded-full bg-few" aria-hidden /> {t.recListening} {clock(seconds)}
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-most transition-[width] duration-100" style={{ width: `${Math.max(4, level * 100)}%` }} />
          </div>
          <Button size="lg" variant="outline" className="h-14 w-full text-lg" onClick={stop}>
            <SquareIcon aria-hidden className="fill-current" /> {t.recStop}
          </Button>
        </div>
      )}

      {phase === 'review' && take && url && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-muted-foreground">
            {t.recPlay} · {clock(take.seconds)}
          </p>
          <audio controls src={url} className="w-full">
            <track kind="captions" />
          </audio>
          {!token && (
            <form onSubmit={login} className="slate-card flex flex-col gap-3 rounded-2xl p-4">
              <p className="text-muted-foreground">{t.signInToSend}</p>
              <input name="email" type="email" autoComplete="username" required placeholder={t.email} aria-label={t.email} className={field} />
              <input name="password" type="password" autoComplete="current-password" required placeholder={t.password} aria-label={t.password} className={field} />
              <Button type="submit" variant="outline" size="lg">
                {t.signIn}
              </Button>
            </form>
          )}
          <Button size="lg" className="h-14 text-lg" disabled={busy || !token} onClick={() => save(true)}>
            <UploadCloudIcon aria-hidden /> {t.recSend}
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => save(false)}>
            <CheckCircle2Icon aria-hidden /> {t.recSaveOnly}
          </Button>
          <Button size="lg" variant="ghost" disabled={busy} className="text-muted-foreground" onClick={discard}>
            <Trash2Icon aria-hidden /> {t.recDiscard}
          </Button>
        </div>
      )}

      {blocked && (
        <p role="alert" className="rounded-2xl bg-bad p-4 text-lg text-bad-foreground">
          {t.micBlocked}
        </p>
      )}
      {message && (
        <p role="status" className={cn('rounded-2xl p-4 text-lg', message.ok ? 'bg-ok text-ok-foreground' : 'bg-warn text-warn-foreground')}>
          {message.text}
        </p>
      )}

      <Button variant="ghost" size="lg" onClick={onClose} disabled={busy} className="text-muted-foreground">
        {t.cancel}
      </Button>
    </div>
  )
}
