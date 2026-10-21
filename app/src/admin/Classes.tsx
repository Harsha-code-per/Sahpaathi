import { AlertTriangleIcon, CalendarCheckIcon, PhoneCallIcon, SchoolIcon, StarIcon, UsersIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { adminApi, ApiError, insightsApi, type DataView, type Insights } from './api'
import { SampleBanner } from './SampleBanner'
import { C, card, tooltip } from './theme'
import { Empty, Panel, Tile } from './ui'
import { CLASS_STATUS, lessonTitles, mixBar, partName, pct } from './view'

const shortDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Class health: which classes need support, which part of which lesson loses children, how the weeks compare. */
export default function Classes({ view, onView, onSignedOut }: { view: DataView; onView: (v: DataView) => void; onSignedOut: () => void }) {
  const [data, setData] = useState<Insights | null>(null)
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState('')

  const load = useCallback(() => {
    Promise.all([insightsApi.get(view), adminApi.episodes()]).then(
      ([d, e]) => (setData(d), setTitles(lessonTitles(e)), setError('')),
      (err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
        setError(err instanceof ApiError ? err.message : 'Could not load the class health board.')
      },
    )
  }, [view, onSignedOut])
  useEffect(load, [load])

  if (error)
    return (
      <p role="alert" className="rounded-2xl bg-bad p-5 text-bad-foreground">
        {error}
      </p>
    )
  if (!data) return <p className="text-muted-foreground">Loading…</p>

  const t = data.totals
  const understood = data.segments.reduce((s, g) => s + Math.round(((g.pct_most ?? 0) * g.taps) / 100), 0)
  const needing = data.classrooms.filter((c) => c.status === 'needs support').length
  const watching = data.classrooms.filter((c) => c.status === 'watch').length
  const lesson = (id: string) => titles.get(id) ?? id
  const weeks = data.weeks.map((w) => ({ ...w, label: shortDate(w.week_start), Most: w.pct_most, Few: w.pct_few }))
  const hasData = t.taps > 0 || data.classrooms.length > 0

  return (
    <>
      <SampleBanner view={view} onView={onView} sampleTaps={data.sample.taps} onChanged={load} />

      {!hasData ? (
        <Panel title="No classroom data yet">
          <Empty>Each class appears here once its teacher’s phone has a classroom code and syncs. Until then, load the sample classrooms above to see the screen filled in.</Empty>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile lead label="Classrooms reporting" value={String(t.classrooms)} note={`${t.lessons_played} lesson plays across ${t.episodes} lesson${t.episodes === 1 ? '' : 's'}`} />
            <Tile tint="mint" label="“Most got it”" value={t.taps ? pct((100 * understood) / t.taps) : '–'} note={`of ${t.taps} teacher taps`} />
            <Tile tint="sun" label="Need a visit" value={String(needing)} note={`${watching} more to watch`} />
            <Tile tint="sky" label="Teacher rating" value={data.feedback.avg_rating ? data.feedback.avg_rating.toFixed(1) : '–'} note={data.feedback.count ? `from ${data.feedback.count} ratings of 5` : 'no ratings yet'} />
          </div>

          <Panel title="Which classes need support" note="Sorted so the ones to visit come first">
            <ul className="divide-y divide-border">
              {data.classrooms.map((c) => {
                const bar = mixBar(c)
                return (
                  <li key={c.classroom_id} className="grid gap-3 py-3.5 md:grid-cols-[minmax(0,15rem)_1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                        <span className="inline-flex items-center gap-2 break-all">
                          <SchoolIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          {c.classroom_id}
                        </span>
                        {c.sample && <span className="rounded-full bg-[var(--tint-sun)] px-2 py-0.5 text-xs font-bold text-[#8a5a00]">SAMPLE</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {c.lesson_days} lesson day{c.lesson_days === 1 ? '' : 's'}
                        {c.last_active && ` · last ${shortDate(c.last_active)}`}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Most ${pct(c.pct_most)}, some ${pct(c.pct_some)}, few ${pct(c.pct_few)} of ${c.taps} taps`}>
                        <span style={{ width: `${bar.most}%`, background: C.most }} />
                        <span style={{ width: `${bar.some}%`, background: C.some }} />
                        <span style={{ width: `${bar.few}%`, background: C.few }} />
                      </div>
                      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span>Most {pct(c.pct_most)}</span>
                        <span>Few {pct(c.pct_few)}</span>
                        <span className="inline-flex items-center gap-1">
                          <PhoneCallIcon className="size-3" aria-hidden /> {c.calls_answered}/{c.calls} calls answered{c.calls_help ? `, ${c.calls_help} asked for help` : ''}
                        </span>
                        {c.avg_rating && (
                          <span className="inline-flex items-center gap-1">
                            <StarIcon className="size-3" aria-hidden /> {c.avg_rating.toFixed(1)}
                          </span>
                        )}
                      </p>
                    </div>
                    <span title={CLASS_STATUS[c.status].hint} className={`justify-self-start rounded-full px-3 py-1 text-sm font-bold md:justify-self-end ${CLASS_STATUS[c.status].tone}`}>
                      {c.status}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Where children get lost" note="Parts of lessons with the most “Few got it”">
              {data.hardest_parts.length === 0 ? (
                <Empty>Needs at least 8 taps on a part before it can be called hard.</Empty>
              ) : (
                <ol className="space-y-3">
                  {data.hardest_parts.map((s) => (
                    <li key={`${s.episode_id}-${s.segment_id}`} className="space-y-1">
                      <p className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <b>{partName(s.segment_id)}</b> · {lesson(s.episode_id)}
                        </span>
                        <span className="shrink-0 font-bold" style={{ color: C.few }}>
                          {pct(s.pct_few)} few
                        </span>
                      </p>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${s.pct_few ?? 0}%`, background: C.few }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel title="Week by week" note="Share of taps, last 8 weeks">
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={weeks} margin={{ left: -18, right: 12 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltip} formatter={(v) => (v === null ? '–' : `${v}%`)} />
                    <Line dataKey="Most" stroke={C.most} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                    <Line dataKey="Few" stroke={C.few} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-muted-foreground">Weeks with no taps have no point. A line that moves is not proof that lessons work: classes and lessons change from week to week.</p>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="What teachers say about the lessons" note={data.feedback.count ? `${data.feedback.count} ratings` : undefined}>
              {data.feedback.count === 0 ? (
                <Empty>No ratings yet. Teachers will be asked “was this lesson clear?” after each lesson.</Empty>
              ) : (
                <div className="space-y-4">
                  <ul className="space-y-1.5" aria-label="Ratings">
                    {[5, 4, 3, 2, 1].map((r) => (
                      <li key={r} className="flex items-center gap-2 text-sm">
                        <span className="inline-flex w-10 items-center gap-1">
                          {r} <StarIcon className="size-3" aria-hidden />
                        </span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full" style={{ width: `${(100 * (data.feedback.ratings[String(r)] ?? 0)) / data.feedback.count}%`, background: r >= 4 ? C.most : r === 3 ? C.some : C.few }} />
                        </span>
                        <b className="w-8 text-right">{data.feedback.ratings[String(r)] ?? 0}</b>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-wrap gap-2">
                    {Object.entries(data.feedback.tags).map(([tag, n]) => (
                      <li key={tag} className="rounded-full bg-secondary px-3 py-1 text-sm">
                        {tag} <b>{n}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <section className={`${card} space-y-3`} aria-label="How to read this">
              <h2 className="font-heading text-lg font-bold">How to read this board</h2>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex gap-2.5">
                  <UsersIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> A class is only a code like <code className="whitespace-nowrap">G2-A</code>. There are no names and no phone numbers anywhere on this screen.
                </li>
                <li className="flex gap-2.5">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> “Needs support” means about a third or more of the checkpoints were “Few got it”. It is a reason to visit, not a verdict on a teacher.
                </li>
                <li className="flex gap-2.5">
                  <CalendarCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Percentages need at least 8 deliberate taps. Fewer shows “not enough taps yet”.
                </li>
                <li className="flex gap-2.5">
                  <StarIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Taps are what the teacher saw in the room, not a test of the children.
                </li>
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  )
}
