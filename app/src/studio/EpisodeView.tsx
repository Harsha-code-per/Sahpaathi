import { ArrowLeftIcon, PencilIcon, SparklesIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Episode, Line } from '../lib/types'
import { api, ApiError, type Detail, type Edit, type Issue, type PartTaps, type Status } from './api'
import { CRITERIA, LANG_NAMES, STATUS, glossById, issuesByLine, minutes, schoolShare, svgDataUrl } from './view'

const POLL_MS = 5000
const SPEAKER: Record<Line['speaker'], string | null> = { guide: null, child: 'Child voice', song: 'Sung' }
const CRITERION_LABEL = Object.fromEntries(CRITERIA.map((c) => [c.key, c.label]))
const card = 'rounded-2xl border border-border bg-card p-5'

/** Score chips are tinted by quality (mint 5, sun 4, plain 3, rose 2 or lower), always beside the number. */
function scoreFill(score: number) {
  return score >= 5 ? 'bg-[var(--tint-mint)]' : score === 4 ? 'bg-[var(--tint-sun)]' : score === 3 ? 'bg-card' : 'bg-bad'
}

function scoreTone(score: number) {
  return score >= 4 ? 'text-ok-foreground' : score === 3 ? 'text-foreground' : 'text-bad-foreground'
}

function IssueNote({ issue }: { issue: Issue }) {
  return (
    <div className="mt-3 rounded-xl bg-warn px-4 py-3 text-sm text-foreground">
      <p>
        <strong className="text-warn-foreground">{CRITERION_LABEL[issue.criterion]}:</strong> {issue.problem}
      </p>
      <p className="mt-1 text-muted-foreground">Suggested fix: {issue.fix}</p>
    </div>
  )
}

interface LineCtx {
  ep: Episode
  gloss: Map<string, string>
  issues: Map<string, Issue[]>
  edits: Record<string, Edit>
  /** Set while the episode is in review: the reviewer may correct a line's wording. */
  onEdit?: (lineId: string, text: string) => Promise<void>
}

/** Inline correction of one line. 422s (empty, not a recorded Santali phrase) stay in the row. */
function LineEditor({ line, onSave, onDone }: { line: Line; onSave: (text: string) => Promise<void>; onDone: () => void }) {
  const [text, setText] = useState(line.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(text)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the line.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        lang={line.lang}
        aria-label={`Correct line ${line.id}`}
        className="block w-full rounded-xl border border-input bg-background p-3 text-lg leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      {error && (
        <p role="alert" className="text-sm text-bad-foreground">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !text.trim() || text === line.text}>
          {busy ? 'Saving…' : 'Save line'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** One spoken line: home language on a marigold rule, school language on a leaf rule, English beside it. */
function LineRow({ line, ctx }: { line: Line; ctx: LineCtx }) {
  const [editing, setEditing] = useState(false)
  const home = line.lang === ctx.ep.home_lang && ctx.ep.home_lang !== ctx.ep.school_lang
  const notes = ctx.issues.get(line.id) ?? []
  const edit = ctx.edits[line.id]
  const gloss = ctx.gloss.get(line.id)
  return (
    <li id={`line-${line.id}`} className={cn('relative scroll-mt-24 border-t border-border py-4 pl-6 first:border-t-0 before:absolute before:top-[1.4rem] before:left-1 before:size-2.5 before:rounded-full', home ? 'before:bg-primary' : 'before:bg-most')}>
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          {editing && ctx.onEdit ? (
            <LineEditor line={line} onSave={(text) => ctx.onEdit!(line.id, text)} onDone={() => setEditing(false)} />
          ) : (
            <p lang={line.lang} className="text-lg leading-relaxed">
              {line.text}
            </p>
          )}
          <p className="text-[0.8125rem] text-muted-foreground">
            {LANG_NAMES[line.lang]}
            {SPEAKER[line.speaker] && ` · ${SPEAKER[line.speaker]}`}
            {line.pause_after_sec > 0 && ` · then a ${line.pause_after_sec} s pause`}
            <span> · {line.id}</span>
          </p>
          {edit && (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-ok-foreground">Corrected by {edit.by}.</span> Was: <span lang={line.lang}>{edit.before}</span>
            </p>
          )}
          {line.cue && <p className="text-sm">Children: {line.cue}</p>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="leading-relaxed text-muted-foreground">
            {edit && gloss && <span className="text-xs font-semibold">English of the original line: </span>}
            {gloss ?? 'No English translation.'}
          </p>
          {ctx.onEdit && !editing && (
            <Button size="icon" variant="ghost" aria-label={`Edit line ${line.id}`} title="Edit line" onClick={() => setEditing(true)}>
              <PencilIcon aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {notes.map((n, i) => (
        <IssueNote key={i} issue={n} />
      ))}
    </li>
  )
}

function Lines({ lines, ctx }: { lines: Line[]; ctx: LineCtx }) {
  return (
    <ul>
      {lines.map((l) => (
        <LineRow key={l.id} line={l} ctx={ctx} />
      ))}
    </ul>
  )
}

/** How much of this segment's main path is in each language: the handover, made visible. */
function Handover({ ep, index }: { ep: Episode; index: number }) {
  if (ep.home_lang === ep.school_lang) return null
  const school = Math.round(schoolShare(ep, index) * 100)
  return (
    <div className="max-w-md" aria-label={`${100 - school}% ${LANG_NAMES[ep.home_lang]}, ${school}% ${LANG_NAMES[ep.school_lang]}`}>
      <div className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-primary" style={{ width: `${100 - school}%` }} />
        <span className="bg-most" style={{ width: `${school}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {100 - school}% {LANG_NAMES[ep.home_lang]}, {school}% {LANG_NAMES[ep.school_lang]}
      </p>
    </div>
  )
}

const BRANCHES = [
  { part: 'easier', when: 'If few got it' },
  { part: 'core', when: 'If some got it, or no tap in 10 s' },
  { part: 'stretch', when: 'If most got it' },
] as const

/** Number of review notes on these lines, shown on the part's tab. */
function flagCount(lines: Line[], issues: Map<string, Issue[]>) {
  return lines.reduce((n, l) => n + (issues.get(l.id)?.length ?? 0), 0)
}

/**
 * How classes did on this part, and a way to have Claude rewrite just this part from that evidence.
 * The rewrite becomes a new version that goes through the guardrails and review like any lesson.
 */
function InClass({ part, onRewrite }: { part?: PartTaps; onRewrite?: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!onRewrite) return null
  const pct = (n: number) => (part?.taps ? Math.round((100 * n) / part.taps) : 0)

  async function go() {
    setBusy(true)
    setError('')
    try {
      await onRewrite!(note)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the rewrite.')
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-background p-4" aria-label="How classes did on this part">
      {part?.taps ? (
        <div className="space-y-2">
          <p className="font-semibold">
            In class: {part.taps} taps · <span className={pct(part.few) >= 40 ? 'text-bad-foreground' : ''}>{pct(part.few)}% few got it</span>
            {part.auto > 0 && <span className="font-normal text-muted-foreground"> · {part.auto} with no tap</span>}
          </p>
          <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={`Most ${pct(part.most)}%, some ${pct(part.some)}%, few ${pct(part.few)}%`}>
            <span className="bg-most" style={{ width: `${pct(part.most)}%` }} />
            <span className="bg-some" style={{ width: `${pct(part.some)}%` }} />
            <span className="bg-few" style={{ width: `${pct(part.few)}%` }} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No classroom taps for this part yet. You can still ask for a rewrite with a note.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1">
          <span className="sr-only">What should change in this part?</span>
          <input
            className="h-11 w-full rounded-xl border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            placeholder="What should change? e.g. smaller numbers, more pebble work"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button variant="outline" disabled={busy || (!part?.taps && !note.trim())} onClick={go}>
          <SparklesIcon aria-hidden /> {busy ? 'Starting…' : 'Rewrite this part'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad-foreground">
          {error}
        </p>
      )}
    </section>
  )
}

function Script({ ep, ctx, parts: taps, onRewrite }: { ep: Episode; ctx: LineCtx; parts: PartTaps[]; onRewrite?: (segmentId: string, note: string) => Promise<void> }) {
  const parts = [
    ...ep.segments.map((s, i) => ({ id: s.id, label: `Part ${i + 1}`, lines: [...s.teach, ...s.easier, ...s.core, ...s.stretch] })),
    { id: 'analogy', label: 'Analogy', lines: ep.analogy },
    { id: 'recap', label: 'Call recap', lines: ep.ivr_recap },
  ]
  return (
    <Tabs defaultValue={parts[0].id} className="gap-4">
      <TabsList variant="line" className="h-auto flex-wrap justify-start">
        {parts.map((p) => {
          const flags = flagCount(p.lines, ctx.issues)
          return (
            <TabsTrigger key={p.id} value={p.id} className="min-h-11 flex-none px-3 text-[0.9375rem] text-muted-foreground data-active:text-foreground">
              {p.label}
              {flags > 0 && (
                <span className="rounded-full bg-warn px-1.5 text-xs font-bold text-warn-foreground" aria-label={`${flags} notes`}>
                  {flags}
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
      {ep.segments.map((s, i) => (
        <TabsContent key={s.id} value={s.id} keepMounted className={cn(card, 'space-y-4 text-base')}>
          <div className="space-y-2">
            <h3 className="font-heading text-xl font-bold">{s.title}</h3>
            <Handover ep={ep} index={i} />
          </div>
          <InClass part={taps.find((t) => t.segment_id === s.id)} onRewrite={onRewrite && ((note) => onRewrite(s.id, note))} />
          <Lines lines={s.teach} ctx={ctx} />
          <p className="rounded-xl bg-sidebar px-4 py-3 text-sidebar-foreground">
            <span className="font-semibold text-sidebar-primary">Teacher checks:</span> <span lang={ep.school_lang}>{s.checkpoint}</span>
          </p>
          {BRANCHES.map((b) => (
            <div key={b.part}>
              <h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{b.when}</h4>
              <Lines lines={s[b.part]} ctx={ctx} />
            </div>
          ))}
        </TabsContent>
      ))}
      <TabsContent value="analogy" keepMounted className={cn(card, 'text-base')}>
        <p className="text-sm text-muted-foreground">Plays when the teacher presses “Need a simpler analogy”.</p>
        <Lines lines={ep.analogy} ctx={ctx} />
      </TabsContent>
      <TabsContent value="recap" keepMounted className={cn(card, 'text-base')}>
        <p className="text-sm text-muted-foreground">About {Math.round(minutes(ep.ivr_recap))} minutes on a parent's basic phone, the evening of the lesson.</p>
        <Lines lines={ep.ivr_recap} ctx={ctx} />
      </TabsContent>
    </Tabs>
  )
}

function Decision({ detail, onDecided, onError }: { detail: Detail; onDecided: (d: Detail) => void; onError: (e: unknown) => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (detail.status === 'approved' || detail.status === 'rejected') {
    return (
      <div className={card}>
        <p className="font-semibold">
          {STATUS[detail.status].label} by {detail.reviewed_by}
        </p>
        {detail.review_notes && <p className="mt-1 text-muted-foreground">{detail.review_notes}</p>}
      </div>
    )
  }

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true)
    setError('')
    try {
      onDecided(await api.decide(detail.id, decision, notes))
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setError(err.message)
      else onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sticky bottom-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
      {error && (
        <p role="alert" className="basis-full text-sm text-bad-foreground">
          {error}
        </p>
      )}
      <label className="min-w-60 flex-1">
        <span className="sr-only">Notes for your decision</span>
        <textarea
          className="block min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          rows={1}
          placeholder="Notes: what you checked, or what must change"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex gap-2 max-sm:w-full">
        <Button variant="outline" disabled={busy} onClick={() => decide('reject')} className="text-bad-foreground max-sm:flex-1">
          Reject
        </Button>
        <Button disabled={busy} onClick={() => decide('approve')} className="bg-foreground text-background hover:bg-foreground/85 max-sm:flex-1">
          Approve for voicing
        </Button>
      </div>
    </div>
  )
}

export default function EpisodeView(props: {
  id: number
  status?: Status
  onBack: () => void
  onChanged: () => void
  onError: (e: unknown) => void
  /** Opens another version, e.g. the rewrite just started. */
  onOpen: (id: number) => void
}) {
  const { id, status, onChanged, onError, onOpen } = props
  const [detail, setDetail] = useState<Detail | null>(null)
  const [taps, setTaps] = useState<PartTaps[]>([])

  const load = useCallback(() => api.episode(id).then(setDetail, onError), [id, onError])
  useEffect(() => {
    load()
  }, [load, status]) // reload when the list sees the status change (e.g. writing → needs review)

  const reviewable = detail?.status === 'in_review' || detail?.status === 'approved'
  useEffect(() => {
    if (reviewable) api.classroom(id).then(setTaps, onError)
  }, [id, reviewable, onError])

  useEffect(() => {
    if (detail?.status !== 'generating') return
    const t = window.setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [detail?.status, load])

  if (!detail) return <p className="text-muted-foreground">Loading…</p>
  const ep = detail.episode
  const edits = detail.edits ?? {}
  const onEdit =
    detail.status === 'in_review'
      ? async (lineId: string, text: string) => {
          try {
            setDetail(await api.editLine(id, lineId, text))
          } catch (err) {
            if (err instanceof ApiError && (err.status === 422 || err.status === 409)) throw err // shown in the row
            onError(err)
          }
        }
      : undefined
  const ctx: LineCtx | null = ep ? { ep, gloss: glossById(detail.review), issues: issuesByLine(ep, detail.review), edits, onEdit } : null
  const edited = Object.keys(edits).length
  const general = ctx?.issues.get('episode') ?? []
  const main = ep ? ep.segments.flatMap((s) => [...s.teach, ...s.core]) : []

  return (
    <article className="space-y-5">
      <Button variant="ghost" onClick={props.onBack} className="-ml-2 md:hidden">
        <ArrowLeftIcon aria-hidden /> All lessons
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {ep && (
            <p className="text-[0.8125rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Grade {ep.grade} · {ep.district} ·{' '}
              {ep.home_lang === ep.school_lang ? LANG_NAMES[ep.school_lang] : `${LANG_NAMES[ep.home_lang]} → ${LANG_NAMES[ep.school_lang]}`} · {Math.round(minutes(main))} min
            </p>
          )}
          <h1 className="font-heading text-3xl leading-tight font-bold" lang={ep?.school_lang}>
            {ep?.title ?? 'Writing this lesson…'}
          </h1>
          {detail.status === 'generating' && (
            <p className="text-muted-foreground" aria-live="polite">
              Claude is writing and reviewing it. This page updates by itself.
            </p>
          )}
          {detail.status === 'failed' && <p className="text-bad-foreground">{detail.error}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[detail.status].tone}`}>{STATUS[detail.status].label}</span>
      </header>

      {ep && ctx && detail.review && (
        <>
          <section className="space-y-3" aria-label="AI review">
            <dl className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
              {CRITERIA.map((c) => {
                const s = detail.review!.rubric.scores[c.key]
                return (
                  <div key={c.key} title={s.reason} className={cn('min-w-0 rounded-xl border px-3 py-2.5 sm:min-w-28 sm:px-3.5', scoreFill(s.score), s.score <= 2 ? 'border-few' : 'border-black/5')}>
                    <dt className="text-[0.8125rem] text-muted-foreground">{c.label}</dt>
                    <dd className={cn('text-lg font-bold', scoreTone(s.score))}>{s.score} / 5</dd>
                  </div>
                )
              })}
            </dl>
            <p className="text-muted-foreground">
              {detail.passed
                ? 'The AI review found no blocking problems. You still decide.'
                : `The AI review left ${detail.review.rubric.issues.length} notes, pinned under the lines they are about.`}
              {detail.status === 'in_review' && ' Use the pencil on any line to correct its wording.'}
            </p>
            {edited > 0 && (
              <p className="font-semibold text-ok-foreground">
                {edited} {edited === 1 ? 'line' : 'lines'} corrected by reviewers. The scores and notes are from before the corrections.
              </p>
            )}
            {general.map((n, i) => (
              <IssueNote key={i} issue={n} />
            ))}
          </section>

          <section className={cn(card, 'flex flex-wrap gap-6')}>
            <div className="min-w-48 flex-1">
              <h2 className="font-semibold">Before class</h2>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground" lang={ep.school_lang}>
                {ep.materials.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <figure>
              <img src={svgDataUrl(ep.chalk_sketch_svg)} alt="Blackboard sketch the teacher draws before class" className="h-28 rounded-xl bg-background p-2" />
              <figcaption className="mt-1 text-xs text-muted-foreground">Blackboard sketch</figcaption>
            </figure>
          </section>

          <Script
            ep={ep}
            ctx={ctx}
            parts={taps}
            onRewrite={reviewable ? async (segmentId, note) => onOpen((await api.rewrite(id, segmentId, note)).id) : undefined}
          />
          <Decision detail={detail} onDecided={(d) => (setDetail(d), onChanged())} onError={onError} />
        </>
      )}
    </article>
  )
}
