import { ArrowDownIcon, ArrowUpIcon, BookOpenTextIcon, CalculatorIcon, ChevronLeftIcon, MicIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Episode } from '../lib/types'
import { listPacks } from '../packs/store'
import type { OutboxEvent, RecordingRecord } from '../storage/db'
import { listHistory } from '../storage/history'
import Recorder from './Recorder'
import { useT } from './i18n'
import { latestByTopic, listRecordings, refreshReviews, sendPending } from './recordings'
import { samplePacks } from './samplePack'
import { DEFAULT_DAYS, applyOrder, autoOrder, gradesOf, move, teachingDates, type Subject } from './schedule'

// The timetable. Subject folders, then grade boxes side by side, then that grade's topics in teaching order with a
// date each and a Record button. Her choices (teaching days, her own order) are kept on the phone.

const KEY = 'sahpaathi.plan'
interface Saved {
  days: number[]
  order: Record<string, string[]>
}
function load(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return { days: Array.isArray(o.days) ? o.days.filter((d) => d >= 0 && d <= 6) : DEFAULT_DAYS, order: o.order && typeof o.order === 'object' ? o.order : {} }
  } catch {
    return { days: DEFAULT_DAYS, order: {} }
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: the plan lasts for this visit */
  }
}

const SUBJECTS: { id: Subject; icon: typeof CalculatorIcon }[] = [
  { id: 'numeracy', icon: CalculatorIcon },
  { id: 'literacy', icon: BookOpenTextIcon },
]

export default function Timetable() {
  const { t, lang } = useT()
  const [packs, setPacks] = useState<Episode[]>([])
  const [events, setEvents] = useState<OutboxEvent[]>([])
  const [recs, setRecs] = useState<RecordingRecord[]>([])
  const [plan, setPlan] = useState<Saved>(load)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [grade, setGrade] = useState<number | null>(null)
  const [recording, setRecording] = useState<Episode | null>(null)
  const [today] = useState(() => new Date())

  const episodes = useMemo(() => [...packs, ...samplePacks.map((s) => s.episode)], [packs])
  const refresh = useCallback(async () => {
    const [p, h, r] = await Promise.all([listPacks(), listHistory(), listRecordings()])
    setPacks(p.map((x) => x.episode))
    setEvents(h)
    setRecs(r)
    // Best effort, quietly: send what is waiting and pull in finished AI reviews.
    sendPending()
      .then(() => refreshReviews())
      .then(setRecs, () => {})
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    refresh().catch((e) => console.error('Could not read the plan', e))
  }, [refresh])

  const update = (next: Saved) => (setPlan(next), save(next))
  const latest = latestByTopic(recs)
  const status = (id: string) => latest.get(id)?.status ?? 'none'

  if (recording) {
    return (
      <Recorder
        episode={recording}
        onClose={() => {
          setRecording(null)
          refresh().catch(() => {})
        }}
      />
    )
  }

  const inSubject = (s: Subject) => episodes.filter((e) => e.subject === s)
  const recordedIn = (list: Episode[]) => list.filter((e) => latest.has(e.id)).length

  // ---- level 1: subject folders ----
  if (!subject) {
    return (
      <div className="flex flex-col gap-5">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold">{t.planPageTitle}</h1>
          <p className="text-muted-foreground">{t.planIntro}</p>
        </div>
        <Days days={plan.days} onChange={(days) => update({ ...plan, days })} />
        <ul className="grid gap-3">
          {SUBJECTS.map(({ id, icon: Icon }) => {
            const list = inSubject(id)
            const done = recordedIn(list)
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => (setSubject(id), setGrade(gradesOf(episodes, id)[0] ?? null))}
                  className="slate-card press flex w-full items-center gap-4 rounded-3xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block font-heading text-xl font-bold">{t.subjectNames[id]}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t.topicsCount(list.length)} · {t.recordedCount(done, list.length)}
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${list.length ? (100 * done) / list.length : 0}%` }} />
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // ---- level 2: grade boxes, then that grade's topics ----
  const grades = gradesOf(episodes, subject)
  const g = grade !== null && grades.includes(grade) ? grade : (grades[0] ?? null)
  const key = `${subject}-${g}`
  const topics =
    g === null
      ? []
      : applyOrder(
          episodes.filter((e) => e.subject === subject && e.grade === g),
          plan.order[key],
          events,
        )
  const dates = teachingDates(topics.length, plan.days, today)
  const setOrder = (ids: string[]) => update({ ...plan, order: { ...plan.order, [key]: ids } })
  const ids = topics.map((e) => e.id)

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" className="-ml-3 self-start text-muted-foreground" onClick={() => setSubject(null)}>
        <ChevronLeftIcon aria-hidden /> {t.allSubjects}
      </Button>
      <h1 className="font-heading text-2xl font-bold">{t.subjectNames[subject]}</h1>

      <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1" role="tablist" aria-label={t.subjectNames[subject]}>
        {grades.map((n) => {
          const list = episodes.filter((e) => e.subject === subject && e.grade === n)
          const on = n === g
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setGrade(n)}
              className={cn(
                'press min-w-36 shrink-0 snap-start rounded-2xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-transparent bg-primary text-primary-foreground shadow-[0_12px_24px_-12px_rgb(244_178_62/0.7)]' : 'slate-card',
              )}
            >
              <span className="block font-heading text-xl font-bold">{t.gradeBox(n)}</span>
              <span className={cn('block text-sm', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{t.recordedCount(recordedIn(list), list.length)}</span>
            </button>
          )
        })}
      </div>

      <Days days={plan.days} onChange={(days) => update({ ...plan, days })} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t.autoArrangeNote}</p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOrder(autoOrder(topics, events))}>
          <SparklesIcon aria-hidden /> {t.autoArrange}
        </Button>
      </div>

      {topics.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-lg text-muted-foreground">{t.noTopics}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {topics.map((e, i) => {
            const st = status(e.id)
            const r = latest.get(e.id)
            return (
              <li key={e.id} className="slate-card space-y-3 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-accent py-2 text-center leading-tight" aria-label={dates[i]?.toDateString()}>
                    <span className="text-[0.6875rem] font-bold tracking-wide uppercase text-muted-foreground">{dates[i]?.toLocaleDateString(lang, { weekday: 'short' })}</span>
                    <span className="font-heading text-xl font-bold">{dates[i]?.getDate() ?? '–'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold" lang={e.school_lang}>
                      {e.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{t.lessonMeta(e.grade, e.district, e.duration_min)}</p>
                    <p
                      className={cn(
                        'mt-1 inline-block rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold',
                        st === 'none' ? 'bg-muted text-muted-foreground' : st === 'reviewed' ? 'bg-ok text-ok-foreground' : 'bg-warn text-warn-foreground',
                      )}
                    >
                      {t.recStatus[st]}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      aria-label={t.moveUp}
                      disabled={i === 0}
                      onClick={() => setOrder(move(ids, e.id, -1))}
                      className="grid size-10 place-items-center rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                    >
                      <ArrowUpIcon className="size-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t.moveDown}
                      disabled={i === topics.length - 1}
                      onClick={() => setOrder(move(ids, e.id, 1))}
                      className="grid size-10 place-items-center rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
                    >
                      <ArrowDownIcon className="size-5" aria-hidden />
                    </button>
                  </div>
                </div>

                <Button size="lg" variant={st === 'none' ? 'default' : 'outline'} className="w-full" onClick={() => setRecording(e)}>
                  <MicIcon aria-hidden /> {st === 'none' ? t.recordBtn : t.reRecord}
                </Button>

                {r && st === 'sent' && (
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>{t.reviewPending}</span>
                    <Button variant="ghost" size="sm" onClick={() => refreshReviews().then(setRecs, () => {})}>
                      <RefreshCwIcon aria-hidden /> {t.checkReview}
                    </Button>
                  </div>
                )}
                {r && (st === 'reviewed' || st === 'unreviewed') && <Review r={r} />}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** Her teaching days: seven chips, Sunday first. */
function Days({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const { t } = useT()
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{t.teachingDays}</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t.teachingDays}>
        {t.dayShort.map((d, i) => {
          const on = days.includes(i)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? days.filter((x) => x !== i) : [...days, i].sort())}
              className={cn(
                'min-h-11 rounded-xl border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground',
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The AI's review of the newest recording: four scores, a sentence, a few tips. */
function Review({ r }: { r: RecordingRecord }) {
  const { t } = useT()
  const rv = r.review
  if (!rv || 'note' in rv) return <p className="text-sm text-muted-foreground">{t.reviewUnavailable}</p>
  return (
    <div className="space-y-2 rounded-xl bg-background/60 p-3" aria-label={t.reviewTitle}>
      <p className="text-[0.8125rem] font-bold tracking-[0.08em] text-primary uppercase">{t.reviewTitle}</p>
      <p className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {(['clarity', 'accuracy', 'pace', 'child_friendly'] as const).map((k) => (
          <span key={k} className="flex items-center justify-between gap-2">
            {t.scoreNames[k]} <b>{rv[k]}/5</b>
          </span>
        ))}
      </p>
      <p>{rv.summary}</p>
      {rv.tips.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {rv.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
