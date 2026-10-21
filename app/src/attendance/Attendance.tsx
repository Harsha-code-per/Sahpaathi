import { CheckCircle2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { isCode, type ClassroomRecord } from '../storage/db'
import { recordAttendance } from '../sync/outbox'
import { getClassroom, parseRolls, rollsAsText, saveClassroom } from './classroom'
import { useT } from '../teacher/i18n'

/**
 * Post-lesson attendance: tap the roll numbers who were absent, and ONE catch-up-call event is queued.
 * It leaves the device with the taps whenever the phone next gets signal; in class nothing is sent.
 */

const field =
  'min-h-14 rounded-xl border border-input bg-background px-4 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

/** The setup form: a classroom code and the roll list. Also used by the Library's Change classroom link. */
export function ClassroomSetup({ classroom, onSaved }: { classroom: ClassroomRecord | null; onSaved: (c: ClassroomRecord) => void }) {
  const { t } = useT()
  const [code, setCode] = useState(classroom?.classroom_id ?? '')
  const [rollsText, setRollsText] = useState(classroom ? rollsAsText(classroom.rolls) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setError(null)
    setBusy(true)
    try {
      onSaved(await saveClassroom({ classroom_id: code.trim(), rolls: parseRolls(rollsText) }))
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.cantSaveClassroom)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-xl font-bold">{t.thisClassroom}</h2>
      <label className="flex flex-col gap-2 text-lg">
        <span className="text-muted-foreground">{t.codeLabel}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} className={cn(field, code !== '' && !isCode(code.trim()) && 'border-2 border-few')} />
      </label>
      <label className="flex flex-col gap-2 text-lg">
        <span className="text-muted-foreground">{t.rollsLabel}</span>
        <input value={rollsText} onChange={(e) => setRollsText(e.target.value)} className={field} />
      </label>
      {error && (
        <p role="alert" className="rounded-2xl bg-bad p-4 text-lg text-bad-foreground">
          {error}
        </p>
      )}
      <Button size="lg" disabled={busy} onClick={save}>
        {busy ? t.saving : t.saveClassroom}
      </Button>
    </section>
  )
}

/** The attendance flow after "Lesson finished": setup on first use, then one tap per absent roll. */
export default function Attendance({ episodeId, onSaved }: { episodeId: string; onSaved: () => void }) {
  const { t } = useT()
  const [classroom, setClassroom] = useState<ClassroomRecord | null | undefined>(undefined)
  const [absent, setAbsent] = useState(new Set<string>())
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)

  useEffect(() => {
    getClassroom().then(setClassroom, (e) => console.error('Could not read the classroom', e))
  }, [])

  if (classroom === undefined) return null
  if (!classroom) return <ClassroomSetup classroom={null} onSaved={setClassroom} />

  const toggle = (roll: string) =>
    setAbsent((p) => {
      const next = new Set(p)
      if (next.has(roll)) next.delete(roll)
      else next.add(roll)
      return next
    })

  const save = async (absentRolls: string[]) => {
    if (saving.current) return // one event per lesson play, even on a quick double tap
    saving.current = true
    setError(null)
    setBusy(true)
    try {
      await recordAttendance({ classroom_id: classroom.classroom_id, episode_id: episodeId, absent: absentRolls })
      setAbsent(new Set(absentRolls))
      setSaved(true)
      onSaved() // flushes together with the taps; offline, it waits for the next signal
    } catch (e) {
      console.error('Could not queue attendance', e)
      saving.current = false
      setError(t.cantSaveAttendance)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">{t.whoAbsent}</h2>
        <span className="text-muted-foreground">{t.classCode(classroom.classroom_id)}</span>
      </div>
      <p className="text-muted-foreground">{t.tapRolls}</p>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {classroom.rolls.map((roll) => (
          <button
            key={roll}
            aria-pressed={absent.has(roll)}
            className={cn(
              'min-h-12 rounded-xl border text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
              absent.has(roll) ? 'border-few bg-few text-[#1a0f0b]' : 'border-input bg-background',
            )}
            disabled={saved}
            onClick={() => toggle(roll)}
          >
            {roll}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-bad p-4 text-lg text-bad-foreground">
          {error}
        </p>
      )}
      {saved ? (
        <p role="status" className="flex gap-3 rounded-2xl bg-ok p-4 text-lg text-ok-foreground">
          <CheckCircle2Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
          <span>{t.savedAttendance(absent.size)}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={busy} onClick={() => save([...absent])}>
            {absent.size ? t.saveAbsent(absent.size) : t.saveAttendance}
          </Button>
          <Button size="lg" variant="ghost" disabled={busy} onClick={() => save([])}>
            {t.everyoneHere}
          </Button>
        </div>
      )}
    </section>
  )
}
