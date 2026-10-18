import { useCallback, useEffect, useState } from 'react'
import { adminApi, ApiError, type Dashboard as Data, type Understanding } from './api'
import { dayBars, pct } from './view'

const card = 'rounded-2xl bg-white p-4 shadow-sm'

function Split({ u }: { u: Understanding }) {
  // Same order as the numbers above it (Most, Some, Few) and the player's button colours.
  const parts = [
    { key: 'most', label: 'Most', n: u.most, colour: 'bg-leaf' },
    { key: 'some', label: 'Some', n: u.some, colour: 'bg-sun' },
    { key: 'few', label: 'Few', n: u.few, colour: 'bg-clay' },
  ]
  if (!u.taps) return <p className="text-slate-500">No taps yet.</p>
  return (
    <div
      className="flex h-4 overflow-hidden rounded-full bg-slate-200"
      role="img"
      aria-label={parts.map((p) => `${p.label} got it: ${p.n}`).join(', ')}
    >
      {parts.map((p) => (
        <div key={p.key} className={p.colour} style={{ width: `${(100 * p.n) / u.taps}%` }} />
      ))}
    </div>
  )
}

export default function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    adminApi.dashboard().then(
      (d) => (setData(d), setError('')),
      (err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
        setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.')
      },
    )
  }, [onSignedOut])

  useEffect(load, [load])

  if (error) return <p role="alert" className={`${card} text-clay`}>{error}</p>
  if (!data) return <p className="text-slate-500">Loading…</p>

  const { overall } = data
  const bars = dayBars(data.last_days)
  return (
    <>
      <section className={`${card} space-y-3`} aria-labelledby="understanding">
        <div className="flex items-center justify-between">
          <h2 id="understanding" className="font-semibold">How well children followed</h2>
          <button onClick={load} className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none">
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-4xl font-bold text-leaf">{pct(overall.pct_most)}</p>
            <p className="text-sm text-slate-600">Most got it</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-ink">{pct(overall.pct_some)}</p>
            <p className="text-sm text-slate-600">Some got it</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-clay">{pct(overall.pct_few)}</p>
            <p className="text-sm text-slate-600">Few got it</p>
          </div>
        </div>
        <Split u={overall} />
        <p className="text-sm text-slate-500">
          {overall.taps} teacher taps. {data.auto_fallbacks} checkpoints had no tap, so the lesson carried on with Core; they are not counted above.
        </p>
      </section>

      <section className={card} aria-labelledby="days">
        <h2 id="days" className="mb-3 font-semibold">Taps in the last 14 days</h2>
        <ol className="flex h-32 items-end gap-1">
          {bars.map((b) => (
            <li key={b.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.date}: ${b.taps} taps`}>
              <span className="text-xs text-slate-500">{b.taps || ''}</span>
              <span className="w-full rounded-t bg-ink" style={{ height: `${b.height}%`, minHeight: b.taps ? 2 : 0 }} />
            </li>
          ))}
        </ol>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{bars[0]?.date}</span>
          <span>{bars[bars.length - 1]?.date}</span>
        </div>
      </section>

      <section className={card} aria-labelledby="episodes">
        <h2 id="episodes" className="mb-3 font-semibold">By episode</h2>
        {data.episodes.length === 0 ? (
          <p className="text-slate-500">No lesson has synced taps yet. Taps arrive when a teacher's phone gets signal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Episode</th>
                  <th className="px-3 font-medium">Taps</th>
                  <th className="px-3 font-medium">Most</th>
                  <th className="px-3 font-medium">Some</th>
                  <th className="px-3 font-medium">Few</th>
                  <th className="pl-3 font-medium">No tap</th>
                </tr>
              </thead>
              <tbody>
                {data.episodes.map((e) => (
                  <tr key={e.episode_id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{e.episode_id}</td>
                    <td className="px-3">{e.taps}</td>
                    <td className="px-3 text-leaf">{pct(e.pct_most)}</td>
                    <td className="px-3">{pct(e.pct_some)}</td>
                    <td className="px-3 text-clay">{pct(e.pct_few)}</td>
                    <td className="pl-3">{e.auto_fallbacks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${card} grid gap-3 text-sm sm:grid-cols-3`} aria-label="Content and calls">
        <p>
          <span className="block text-2xl font-bold">{data.packs_ready}</span> packs ready to download
        </p>
        <p>
          <span className="block text-2xl font-bold">{Object.entries(data.episodes_by_status).map(([s, n]) => `${n} ${s.replace('_', ' ')}`).join(', ') || 'none'}</span>
          episodes
        </p>
        <p>
          <span className="block text-2xl font-bold text-slate-400">Soon</span> catch-up call results, once the IVR is live
        </p>
      </section>
    </>
  )
}
