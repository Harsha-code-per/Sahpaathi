import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { adminApi, ApiError, type CallSummary, type PackSummary } from './api'
import Phone from './Phone'
import { callableEpisodes, CALL_STATUS, OUTCOME } from './view'

const card = 'rounded-2xl border border-border bg-card p-5'
const field = 'h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'
const quiet = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-4 font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'
const primary = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

/** Ring a real phone through Exotel. The number goes to the server once and is never stored. */
function RingPhone({ call, onDone, onError }: { call: CallSummary; onDone: (msg: string) => void; onError: (e: unknown) => void }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  async function ring(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      await adminApi.dial(call.id, phone.replace(/[\s-]/g, ''))
      setPhone('')
      onDone(`Ringing ${phone}. The result appears in this list when the call ends.`)
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={ring} className="flex basis-full flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1 space-y-1">
        <span className="text-sm text-muted-foreground">Phone to ring (a team phone for testing). Used once, never saved.</span>
        <input className={field} type="tel" inputMode="tel" autoComplete="off" required pattern="\+?[0-9 \-]{10,18}" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
      </label>
      <button className={primary} disabled={busy}>
        {busy ? 'Ringing…' : 'Ring this phone'}
      </button>
    </form>
  )
}

export default function Calls({ onSignedOut }: { onSignedOut: () => void }) {
  const [calls, setCalls] = useState<CallSummary[]>([])
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState<CallSummary | null>(null)
  const [classroom, setClassroom] = useState('CLASS-1')
  const [roll, setRoll] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [ringing, setRinging] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    },
    [onSignedOut],
  )

  const refresh = useCallback(
    () =>
      Promise.all([adminApi.calls(), adminApi.packs()]).then(([c, p]) => {
        setCalls(c)
        setPacks(p)
        setLoaded(true)
        setError('')
      }, handle),
    [handle],
  )
  useEffect(() => void refresh(), [refresh])

  const episodes = callableEpisodes(packs)
  const chosen = slug || episodes[0]?.slug || ''

  async function mark(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      await adminApi.queueCall(classroom.trim(), roll.trim(), chosen)
      setRoll('')
      await refresh()
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className={`${card} space-y-3`} aria-labelledby="absent">
        <h2 id="absent" className="font-semibold">Mark a child absent</h2>
        <p className="text-sm text-muted-foreground">
          The teacher's phone sends this by itself when attendance is taken. Use it here to try a call. Give a roll number only, never a name or a phone number.
        </p>
        <form onSubmit={mark} className="grid gap-3 sm:grid-cols-[1fr_8rem_2fr_auto] sm:items-end">
          <label className="block">
            <span className="text-sm font-medium">Class code</span>
            <input className={field} required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9\-]*" value={classroom} onChange={(e) => setClassroom(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Roll number</span>
            <input className={field} required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9\-]*" inputMode="numeric" value={roll} onChange={(e) => setRoll(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Missed episode</span>
            <select className={field} value={chosen} onChange={(e) => setSlug(e.target.value)}>
              {episodes.map((ep) => (
                <option key={ep.slug} value={ep.slug}>{ep.title}</option>
              ))}
            </select>
          </label>
          <button className={primary} disabled={busy || !chosen}>Queue call</button>
        </form>
        {loaded && episodes.length === 0 && (
          <p className="text-sm text-muted-foreground">No episode has a ready pack yet. Build one on the Packs tab first; its recap is what the family hears.</p>
        )}
      </section>

      {error && <p role="alert" className={`${card} text-bad-foreground`}>{error}</p>}
      {notice && <p role="status" className="rounded-2xl bg-ok p-4 text-ok-foreground">{notice}</p>}

      {active && (
        <Phone
          key={active.id}
          call={active}
          onSignedOut={onSignedOut}
          onClose={() => {
            setActive(null)
            void refresh()
          }}
        />
      )}

      <section className={card} aria-labelledby="calls">
        <h2 id="calls" className="mb-3 font-semibold">Catch-up calls</h2>
        {!loaded ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : calls.length === 0 ? (
          <p className="text-muted-foreground">No calls yet. A call is queued for every child marked absent.</p>
        ) : (
          <ul className="divide-y divide-border">
            {calls.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">Roll {c.student_ref} <span className="font-normal text-muted-foreground">({c.classroom_id})</span></p>
                  <p className="text-sm text-muted-foreground">{c.episode_slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CALL_STATUS[c.status].tone}`}>{CALL_STATUS[c.status].label}</span>
                  {c.outcome && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME[c.outcome].tone}`}>{OUTCOME[c.outcome].label}</span>}
                  {c.status === 'queued' && (
                    <>
                      <button className={quiet} onClick={() => setActive(c)}>Simulate</button>
                      <button className={primary} onClick={() => setRinging(ringing === c.id ? null : c.id)} aria-expanded={ringing === c.id}>
                        Ring a phone
                      </button>
                    </>
                  )}
                </div>
                {ringing === c.id && (
                  <RingPhone
                    call={c}
                    onError={handle}
                    onDone={(msg) => {
                      setRinging(null)
                      setNotice(msg)
                      void refresh()
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
