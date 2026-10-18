import { useEffect, useRef, useState } from 'react'
import { isCode, type ClassroomRecord } from '../storage/db'
import { recordAttendance } from '../sync/outbox'
import { getClassroom, parseRolls, rollsAsText, saveClassroom } from './classroom'

/**
 * Post-lesson attendance: tap the roll numbers who were absent, and ONE catch-up-call event is queued.
 * It leaves the device with the taps whenever the phone next gets signal; in class nothing is sent.
 */

/** The setup form: a classroom code and the roll list. Also used by the Library's Change classroom link. */
export function ClassroomSetup({
  classroom,
  onSaved,
}: {
  classroom: ClassroomRecord | null
  onSaved: (c: ClassroomRecord) => void
}) {
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
      setError(e instanceof Error && e.message ? e.message : 'Could not save the classroom. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white/10 p-4">
      <h2 className="text-xl font-semibold text-sun">This classroom</h2>
      <label className="flex flex-col gap-2 text-lg">
        Classroom code, like G2-A
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`min-h-14 rounded-xl bg-white/15 px-4 text-lg ${code === '' || isCode(code.trim()) ? '' : 'border-2 border-clay'}`}
        />
      </label>
      <label className="flex flex-col gap-2 text-lg">
        Roll numbers, like 1-30 or 4, 7, 12
        <input value={rollsText} onChange={(e) => setRollsText(e.target.value)} className="min-h-14 rounded-xl bg-white/15 px-4 text-lg" />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-clay/30 p-4 text-lg">
          {error}
        </p>
      )}
      <button className="min-h-14 rounded-2xl bg-leaf text-xl font-bold disabled:opacity-60" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save classroom'}
      </button>
    </section>
  )
}

/** The attendance flow after "Lesson finished": setup on first use, then one tap per absent roll. */
export default function Attendance({ episodeId, onSaved }: { episodeId: string; onSaved: () => void }) {
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
      setError('Could not save attendance. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-sun">Attendance · {classroom.classroom_id}</h2>
      <p className="text-lg opacity-80">Tap the roll numbers who were absent, then save.</p>
      <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
        {classroom.rolls.map((roll) => (
          <button
            key={roll}
            className={`min-h-14 rounded-xl text-lg font-bold ${absent.has(roll) ? 'bg-clay' : 'bg-white/15'} disabled:opacity-60`}
            disabled={saved}
            onClick={() => toggle(roll)}
          >
            {roll}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-clay/30 p-4 text-lg">
          {error}
        </p>
      )}
      {saved ? (
        <p role="status" className="rounded-xl bg-leaf/25 p-4 text-lg">
          ✓ Attendance saved — {absent.size ? `${absent.size} absent` : 'everyone present'}. It sends at the next signal.
        </p>
      ) : (
        <div className="flex gap-3">
          <button
            className="min-h-14 flex-1 rounded-2xl border-2 border-white/40 text-lg font-semibold disabled:opacity-60"
            disabled={busy}
            onClick={() => save([])}
          >
            Everyone present
          </button>
          <button
            className="min-h-14 flex-1 rounded-2xl bg-leaf text-lg font-bold disabled:opacity-60"
            disabled={busy}
            onClick={() => save([...absent])}
          >
            Save attendance
          </button>
        </div>
      )}
    </section>
  )
}
