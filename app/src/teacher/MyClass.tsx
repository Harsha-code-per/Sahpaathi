import { StarIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ClassroomSetup } from '../attendance/Attendance'
import { getClassroom } from '../attendance/classroom'
import { listPacks } from '../packs/store'
import type { ClassroomRecord, OutboxEvent } from '../storage/db'
import { absences, attendanceLog, clearHistory, lessonResults, listHistory } from '../storage/history'
import { useT } from './i18n'
import { samplePacks } from './samplePack'

const bar = { most: '#3fb8a0', some: '#f4b23e', few: '#e8704a' }
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * The teacher's own view of her class, built from what this phone saw: how each lesson went, who missed
 * lessons, and her ratings. It works offline, never leaves the phone, uses roll codes only, and can be cleared.
 */
export default function MyClass() {
  const { t } = useT()
  const [events, setEvents] = useState<OutboxEvent[] | null>(null)
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const [history, packs, room] = await Promise.all([listHistory(), listPacks(), getClassroom()])
    setEvents(history)
    setTitles(new Map([...samplePacks.map((s) => [s.episode.id, s.episode.title] as const), ...packs.map((p) => [p.episode.id, p.episode.title] as const)]))
    setClassroom(room)
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load().catch((e) => {
      console.error('Could not read the class history', e)
      setEvents([])
    })
  }, [load])

  if (!events) return null
  const results = lessonResults(events)
  const missed = absences(events).slice(0, 6)
  const log = attendanceLog(events).slice(0, 5)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-2xl font-bold">{t.tabClass}</h1>

      {classroom && !editing ? (
        <p className="flex items-center justify-between gap-3 text-muted-foreground">
          {t.classLine(classroom.classroom_id, classroom.rolls.length)}
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {t.changeClass}
          </Button>
        </p>
      ) : (
        <ClassroomSetup
          classroom={classroom}
          onSaved={(c) => {
            setClassroom(c)
            setEditing(false)
          }}
        />
      )}

      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-lg text-muted-foreground">{t.classEmpty}</p>
      ) : (
        <>
          <section aria-label={t.lessonsSoFar} className="space-y-3">
            <h2 className="font-heading text-xl font-bold">{t.lessonsSoFar}</h2>
            <ul className="space-y-3">
              {results.map((r) => {
                const total = r.taps.most + r.taps.some + r.taps.few
                return (
                  <li key={r.episode_id} className="space-y-2.5 slate-card rounded-2xl p-4">
                    <p className="font-semibold">{titles.get(r.episode_id) ?? r.episode_id}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.playedDays(r.plays)} · {day(r.lastPlayed)}
                      {r.automatic > 0 && ` · ${t.noTapCount(r.automatic)}`}
                    </p>
                    {total > 0 && (
                      <>
                        <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t.taps.most} ${r.taps.most}, ${t.taps.some} ${r.taps.some}, ${t.taps.few} ${r.taps.few}`}>
                          {(['most', 'some', 'few'] as const).map((k) => (
                            <span key={k} style={{ width: `${(100 * r.taps[k]) / total}%`, background: bar[k] }} />
                          ))}
                        </div>
                        <p className="flex flex-wrap gap-x-4 text-sm">
                          {(['most', 'some', 'few'] as const).map((k) => (
                            <span key={k} className="inline-flex items-center gap-1.5">
                              <span className="size-2.5 rounded-sm" style={{ background: bar[k] }} aria-hidden />
                              {t.taps[k]} · <b>{r.taps[k]}</b>
                            </span>
                          ))}
                        </p>
                      </>
                    )}
                    {r.rating !== null && (
                      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <StarIcon className="size-4 fill-primary text-primary" aria-hidden /> {t.yourRating(r.rating)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {missed.length > 0 && (
            <section aria-label={t.missedTitle} className="space-y-3">
              <h2 className="font-heading text-xl font-bold">{t.missedTitle}</h2>
              <ul className="flex flex-wrap gap-2">
                {missed.map((m) => (
                  <li key={m.roll} className="rounded-full border border-border bg-card px-4 py-2 text-lg">
                    <b>{m.roll}</b> <span className="text-sm text-muted-foreground">{t.missedTimes(m.missed)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">{t.missedNote}</p>
            </section>
          )}

          {log.length > 0 && (
            <section aria-label={t.recentTitle} className="space-y-3">
              <h2 className="font-heading text-xl font-bold">{t.recentTitle}</h2>
              <ul className="divide-y divide-border slate-card rounded-2xl">
                {log.map((l) => (
                  <li key={l.at} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 truncate">{titles.get(l.episode_id) ?? l.episode_id}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {day(l.at)} · {t.absentCount(l.absent)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="space-y-2">
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={async () => {
                if (!confirm(t.confirmClearHistory)) return
                await clearHistory()
                await load()
              }}
            >
              <Trash2Icon aria-hidden /> {t.clearHistory}
            </Button>
            <p className="text-sm text-muted-foreground">{t.historyNote}</p>
          </div>
        </>
      )}
    </div>
  )
}
