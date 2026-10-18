import { useState, type SubmitEvent } from 'react'
import { recordAttendance } from '../sync/outbox'
import { loadSetup, MAX_CLASS_SIZE, saveSetup, setupProblem, toggleRoll, type ClassSetup } from './roster'

const field = 'w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-3 text-xl text-white placeholder:text-white/50'

/**
 * Take attendance before the lesson. Tap the roll numbers of the children who are absent; when there
 * is signal, a family call is queued for each of them. Roll numbers only: no names are stored.
 */
export default function Attendance({ episodeId, onSaved }: { episodeId: string; onSaved: () => void }) {
  const [setup, setSetup] = useState<ClassSetup>(loadSetup)
  const [editing, setEditing] = useState(() => setupProblem(loadSetup()) !== null)
  const [draft, setDraft] = useState<ClassSetup>(setup)
  const [problem, setProblem] = useState('')
  const [open, setOpen] = useState(false)
  const [absent, setAbsent] = useState<number[]>([])
  const [saved, setSaved] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  function saveClass(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const p = setupProblem(draft)
    setProblem(p ?? '')
    if (p) return
    saveSetup(draft)
    setSetup(draft)
    setAbsent((a) => a.filter((r) => r <= draft.size))
    setEditing(false)
  }

  /** Returns whether it was queued, so the panel only closes on success. */
  async function save(): Promise<boolean> {
    setFailed(false)
    try {
      await recordAttendance({ classroom_id: setup.classroom, episode_id: episodeId, absent: absent.map(String) })
      setSaved(absent.length)
      onSaved()
      return true
    } catch (err) {
      // Nothing is lost silently: the teacher can try again, and the lesson never waits on storage.
      console.error('Could not queue attendance', err)
      setFailed(true)
      return false
    }
  }

  if (!open) {
    return (
      <button className="min-h-14 rounded-2xl border-2 border-white/40 text-xl font-semibold" onClick={() => setOpen(true)}>
        {saved === null ? '📋 Take attendance' : `📋 Attendance saved: ${saved} absent ✓`}
      </button>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white/10 p-4" aria-label="Attendance">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-sun">Who is absent today?</h2>
          {!editing && (
            <p className="text-sm opacity-80">
              Class {setup.classroom}, {setup.size} children.{' '}
              <button className="underline" onClick={() => (setDraft(setup), setEditing(true))}>
                Change
              </button>
            </p>
          )}
        </div>
        <button className="min-h-12 px-2 text-lg opacity-80" onClick={() => setOpen(false)} aria-label="Close attendance">
          ✕
        </button>
      </div>

      {editing ? (
        <form onSubmit={saveClass} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-lg">Class code</span>
            <input className={field} value={draft.classroom} maxLength={40} placeholder="CLASS-1" autoCapitalize="characters" onChange={(e) => setDraft({ ...draft, classroom: e.target.value.trim() })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-lg">Number of children</span>
            <input className={field} type="number" inputMode="numeric" min={1} max={MAX_CLASS_SIZE} value={Number.isNaN(draft.size) ? '' : draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.valueAsNumber })} />
          </label>
          <p className="text-sm opacity-80">Children are listed by roll number only. Never type a name or a phone number.</p>
          {problem && <p role="alert" className="text-lg text-clay">{problem}</p>}
          <button className="min-h-14 rounded-2xl bg-white/20 text-xl font-bold">Save class</button>
        </form>
      ) : (
        <>
          <p className="text-lg">Tap each child who is absent.</p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: setup.size }, (_, i) => i + 1).map((roll) => {
              const out = absent.includes(roll)
              return (
                <button
                  key={roll}
                  aria-pressed={out}
                  onClick={() => (setSaved(null), setAbsent((a) => toggleRoll(a, roll)))}
                  className={`min-h-14 rounded-xl text-xl font-bold ${out ? 'bg-clay' : 'bg-white/15'}`}
                >
                  {roll}
                </button>
              )
            })}
          </div>
          <p className="text-lg" aria-live="polite">
            {absent.length === 0 ? 'Everyone is here.' : `${absent.length} absent: ${absent.join(', ')}`}
          </p>
          {failed && <p role="alert" className="text-lg text-clay">Could not save. Try again.</p>}
          <button className="min-h-14 rounded-2xl bg-leaf text-xl font-bold" onClick={async () => {
              if (await save()) setOpen(false)
            }}>
            Save attendance
          </button>
          <p className="text-sm opacity-80">Each absent child's family gets a short call about today's lesson once your phone has signal.</p>
        </>
      )}
    </section>
  )
}
