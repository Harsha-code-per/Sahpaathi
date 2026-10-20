import { RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CountUp } from '@/components/CountUp'
import { Button } from '@/components/ui/button'
import type { Summary } from '../studio/api'
import { adminApi, ApiError, type Dashboard as Data, type PackSummary } from './api'
import Pipeline from './Pipeline'
import { pct } from './view'

// Chart colours are the theme tokens (index.css); SVG attributes need the values themselves.
const C = { most: '#3fb8a0', some: '#f4b23e', few: '#e8704a', ink: '#172524', muted: '#55625f', grid: '#e3dfd3' }
const tooltip = { contentStyle: { borderRadius: 12, border: `1px solid ${C.grid}`, fontFamily: 'inherit' } }
const card = 'rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(23,37,36,0.04),0_14px_34px_-14px_rgba(23,37,36,0.14)]'

function Tile(props: { label: string; value: string; note: ReactNode; lead?: boolean; children?: ReactNode }) {
  const { lead } = props
  return (
    <div className={`${card} flex flex-col gap-1 ${lead ? 'border-transparent bg-sidebar text-sidebar-foreground' : ''}`}>
      <p className={`text-sm font-semibold ${lead ? 'text-sidebar-muted' : 'text-muted-foreground'}`}>{props.label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className={`font-heading text-5xl leading-none font-bold ${lead ? 'text-sidebar-primary' : ''}`}>
          <CountUp value={props.value} />
        </p>
        {props.children}
      </div>
      <p className={`text-[0.8125rem] ${lead ? 'text-sidebar-muted' : 'text-muted-foreground'}`}>{props.note}</p>
    </div>
  )
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${card} flex min-w-0 flex-col gap-3 ${className}`} aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="grid min-h-40 place-items-center content-center gap-4 text-center text-muted-foreground">
    <span aria-hidden className="relative grid size-14 place-items-center">
      <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e]" />
      <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e] [animation-delay:-1.4s]" />
      <span className="size-4 rounded-full bg-[#f4b23e]" />
    </span>
    <p className="max-w-xs">{children}</p>
  </div>
)

const short = (t: string) => (t.length > 26 ? `${t.slice(0, 25)}…` : t)
const shortDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [episodes, setEpisodes] = useState<Summary[]>([])
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    Promise.all([adminApi.dashboard(), adminApi.episodes(), adminApi.packs()]).then(
      ([d, e, p]) => (setData(d), setEpisodes(e), setPacks(p), setError('')),
      (err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
        setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.')
      },
    )
  }, [onSignedOut])

  useEffect(load, [load])

  if (error)
    return (
      <p role="alert" className="rounded-2xl bg-bad p-5 text-bad-foreground">
        {error}
      </p>
    )
  if (!data) return <p className="text-muted-foreground">Loading…</p>

  const { overall, catchup_calls: calls } = data
  const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches
  const split = [
    { name: 'Most got it', value: overall.most, fill: C.most },
    { name: 'Some got it', value: overall.some, fill: C.some },
    { name: 'Few got it', value: overall.few, fill: C.few },
  ]
  const days = data.last_days.map((d) => ({ ...d, label: shortDate(d.date) }))
  const titles = new Map(packs.filter((p) => p.episode_slug).map((p) => [p.episode_slug!, p.title ?? p.episode_slug!]))
  const lessons = data.episodes.map((e) => ({ name: titles.get(e.episode_id) ?? e.episode_id, Most: e.most, Some: e.some, Few: e.few }))
  const funnel = [
    { label: 'Queued', n: calls.total, colour: C.muted },
    { label: 'Finished', n: calls.completed + calls.no_response, colour: C.some },
    { label: 'A parent answered', n: calls.completed, colour: C.most },
    { label: 'Child understood', n: calls.understood, colour: '#1c7f6c' },
  ]

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" onClick={load}>
          <RefreshCwIcon aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile lead label="“Most got it”" value={pct(overall.pct_most)} note={`of ${overall.taps} teacher taps`} />
        <Tile label="Teacher taps" value={String(overall.taps)} note={`${data.auto_fallbacks} checkpoints had no tap, so Core played`}>
          <div className="h-10 w-28" aria-hidden>
            <ResponsiveContainer>
              <LineChart data={days} accessibilityLayer={false}>
                <Line dataKey="taps" stroke={C.most} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Tile>
        <Tile label="Catch-up calls answered" value={pct(calls.pct_answered)} note={`${calls.completed} of ${calls.completed + calls.no_response} finished calls`} />
        <Tile label="Packs ready" value={String(data.packs_ready)} note="signed, ready to download" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Checkpoint answers" note="Deliberate taps only">
          {overall.taps === 0 ? (
            <Empty>No taps yet. They arrive when a teacher’s phone finds a signal.</Empty>
          ) : (
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative size-44" role="img" aria-label={split.map((s) => `${s.name}: ${s.value}`).join(', ')}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={split} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={animate} />
                    <Tooltip {...tooltip} />
                  </PieChart>
                </ResponsiveContainer>
                <p className="pointer-events-none absolute inset-0 grid place-items-center font-heading text-2xl font-bold">{pct(overall.pct_most)}</p>
              </div>
              <ul className="space-y-2 text-sm">
                {split.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="size-3 rounded-sm" style={{ background: s.fill }} aria-hidden />
                    {s.name} · <b>{s.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Taps per day" note="Last 14 days" className="xl:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={days} margin={{ left: -20, right: 16 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} cursor={{ fill: '#efece3' }} />
                <Bar dataKey="taps" name="Taps" fill={C.most} radius={[6, 6, 0, 0]} isAnimationActive={animate} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Pipeline episodes={episodes} packs={packs} usage={data.episodes} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="How each lesson went" note="Checkpoint answers per lesson" className="xl:col-span-2">
          {lessons.length === 0 ? (
            <Empty>No lesson has synced taps yet.</Empty>
          ) : (
            <div style={{ height: Math.max(160, lessons.length * 52 + 40) }}>
              <ResponsiveContainer>
                <BarChart data={lessons} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={190} tickFormatter={short} tick={{ fill: C.ink, fontSize: 13 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltip} cursor={{ fill: '#efece3' }} />
                  <Bar isAnimationActive={animate} dataKey="Most" stackId="a" fill={C.most} />
                  <Bar isAnimationActive={animate} dataKey="Some" stackId="a" fill={C.some} />
                  <Bar isAnimationActive={animate} dataKey="Few" stackId="a" fill={C.few} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Catch-up calls" note={calls.help ? `${calls.help} families asked for help` : undefined}>
          <ul className="space-y-3.5">
            {funnel.map((f) => (
              <li key={f.label} className="space-y-1">
                <p className="flex justify-between text-sm">
                  {f.label} <b>{f.n}</b>
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${calls.total ? (100 * f.n) / calls.total : 0}%`, background: f.colour }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
