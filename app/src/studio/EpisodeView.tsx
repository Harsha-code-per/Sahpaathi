import { useCallback, useEffect, useState } from 'react'
import type { Episode, Line } from '../lib/types'
import { api, ApiError, type Detail, type Edit, type Issue, type Status } from './api'
import { CRITERIA, LANG_NAMES, STATUS, glossById, issuesByLine, minutes, schoolShare, svgDataUrl } from './view'

const POLL_MS = 5000
const SPEAKER: Record<Line['speaker'], string | null> = { guide: null, child: 'Child voice', song: 'Sung' }
const CRITERION_LABEL = Object.fromEntries(CRITERIA.map((c) => [c.key, c.label]))

function scoreTone(score: number) {
  return score >= 4 ? 'text-leaf' : score === 3 ? 'text-ink' : 'text-clay'
}

function IssueNote({ issue }: { issue: Issue }) {
  return (
    <div className="mt-2 rounded-lg bg-sun/25 px-3 py-2 text-sm">
      <p>
        <strong>{CRITERION_LABEL[issue.criterion]}:</strong> {issue.problem}
      </p>
      <p className="mt-1 text-slate-700">Suggested fix: {issue.fix}</p>
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
        className="block w-full rounded-lg border border-slate-300 p-2 text-lg leading-relaxed focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy || !text.trim() || text === line.text}
          className="rounded-lg bg-ink px-3 py-1 text-sm font-semibold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sun focus-visible:outline-none"
        >
          {busy ? 'Saving…' : 'Save line'}
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** One spoken line: home language on a sun rule, school language on a leaf rule, gloss beside it. */
function LineRow({ line, ctx }: { line: Line; ctx: LineCtx }) {
  const [editing, setEditing] = useState(false)
  const home = line.lang === ctx.ep.home_lang && ctx.ep.home_lang !== ctx.ep.school_lang
  const notes = ctx.issues.get(line.id) ?? []
  const edit = ctx.edits[line.id]
  const gloss = ctx.gloss.get(line.id)
  return (
    <li id={`line-${line.id}`} className={`scroll-mt-20 border-l-4 py-2 pl-3 ${home ? 'border-sun' : 'border-leaf'} ${notes.length ? 'bg-sun/10' : ''}`}>
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        {editing && ctx.onEdit ? (
          <LineEditor line={line} onSave={(text) => ctx.onEdit!(line.id, text)} onDone={() => setEditing(false)} />
        ) : (
          <p lang={line.lang} className="text-lg leading-relaxed">
            {line.text}
          </p>
        )}
        <p className="text-slate-600">
          {edit && gloss && <span className="text-xs font-semibold text-slate-500">English of the original line: </span>}
          {gloss ?? 'No English translation.'}
        </p>
      </div>
      {edit && (
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-semibold text-leaf">Corrected by {edit.by}.</span> Was: <span lang={line.lang}>{edit.before}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {LANG_NAMES[line.lang]}
        {SPEAKER[line.speaker] && `, ${SPEAKER[line.speaker]}`}
        {line.pause_after_sec > 0 && `, then a ${line.pause_after_sec} s pause`}
        <span className="text-slate-400"> {line.id}</span>
        {ctx.onEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-2 rounded px-1.5 py-0.5 font-semibold text-ink underline decoration-slate-300 underline-offset-2 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
          >
            Edit
          </button>
        )}
      </p>
      {line.cue && <p className="mt-1 text-sm text-slate-700">Children: {line.cue}</p>}
      {notes.map((n, i) => (
        <IssueNote key={i} issue={n} />
      ))}
    </li>
  )
}

function Lines({ lines, ctx }: { lines: Line[]; ctx: LineCtx }) {
  return (
    <ul className="space-y-1">
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
    <div className="mt-2" aria-label={`${100 - school}% ${LANG_NAMES[ep.home_lang]}, ${school}% ${LANG_NAMES[ep.school_lang]}`}>
      <div className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-sun" style={{ width: `${100 - school}%` }} />
        <span className="bg-leaf" style={{ width: `${school}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
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

function Script({ ep, ctx }: { ep: Episode; ctx: LineCtx }) {
  return (
    <div className="space-y-4">
      {ep.segments.map((s, i) => (
        <section key={s.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">
            {i + 1}. {s.title}
          </h3>
          <Handover ep={ep} index={i} />
          <div className="mt-3">
            <Lines lines={s.teach} ctx={ctx} />
          </div>
          <p className="mt-3 rounded-lg bg-ink px-3 py-2 text-white">
            Teacher checks: <span lang={ep.school_lang}>{s.checkpoint}</span>
          </p>
          {BRANCHES.map((b) => (
            <div key={b.part} className="mt-3">
              <h4 className="text-sm font-semibold text-slate-600">{b.when}</h4>
              <Lines lines={s[b.part]} ctx={ctx} />
            </div>
          ))}
        </section>
      ))}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Simpler analogy</h3>
        <p className="text-sm text-slate-500">Plays when the teacher presses “Need a simpler analogy”.</p>
        <div className="mt-2">
          <Lines lines={ep.analogy} ctx={ctx} />
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Catch-up call for absent children</h3>
        <p className="text-sm text-slate-500">About {Math.round(minutes(ep.ivr_recap))} minutes on a parent's basic phone, the evening of the lesson.</p>
        <div className="mt-2">
          <Lines lines={ep.ivr_recap} ctx={ctx} />
        </div>
      </section>
    </div>
  )
}

function Decision({ detail, onDecided, onError }: { detail: Detail; onDecided: (d: Detail) => void; onError: (e: unknown) => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (detail.status === 'approved' || detail.status === 'rejected') {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="font-semibold">
          {STATUS[detail.status].label} by {detail.reviewed_by}
        </p>
        {detail.review_notes && <p className="mt-1 text-slate-700">{detail.review_notes}</p>}
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
    <div className="sticky bottom-0 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200 lg:flex lg:flex-wrap lg:items-end lg:gap-3">
      <label className="block lg:flex-1">
        <span className="text-sm font-semibold">Your decision</span>
        <textarea
          className="mt-1 block w-full rounded-lg border border-slate-300 p-2 focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          rows={1}
          placeholder="Notes: what you checked, or what must change"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error && <p role="alert" className="text-sm text-clay lg:order-first lg:basis-full">{error}</p>}
      <div className="mt-2 flex gap-2 lg:mt-0">
        <button
          disabled={busy}
          onClick={() => decide('reject')}
          className="rounded-lg px-4 py-2 font-semibold text-clay ring-1 ring-clay/40 hover:bg-clay/10 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-clay focus-visible:outline-none"
        >
          Reject
        </button>
        <button
          disabled={busy}
          onClick={() => decide('approve')}
          className="flex-1 rounded-lg bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
        >
          Approve for voicing
        </button>
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
}) {
  const { id, status, onChanged, onError } = props
  const [detail, setDetail] = useState<Detail | null>(null)

  const load = useCallback(() => api.episode(id).then(setDetail, onError), [id, onError])
  useEffect(() => {
    load()
  }, [load, status]) // reload when the list sees the status change (e.g. writing → needs review)

  useEffect(() => {
    if (detail?.status !== 'generating') return
    const t = window.setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [detail?.status, load])

  if (!detail) return <p className="text-slate-500">Loading…</p>
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
    <article className="space-y-4">
      <button onClick={props.onBack} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-white lg:hidden">
        ← All episodes
      </button>
      <header className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-2xl font-bold" lang={ep?.school_lang}>
            {ep?.title ?? 'Writing this episode…'}
          </h2>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[detail.status].tone}`}>{STATUS[detail.status].label}</span>
        </div>
        {ep && (
          <p className="mt-1 text-slate-600">
            Grade {ep.grade} in {ep.district},{' '}
            {ep.home_lang === ep.school_lang ? `in ${LANG_NAMES[ep.school_lang]}` : `from ${LANG_NAMES[ep.home_lang]} to ${LANG_NAMES[ep.school_lang]}`}. About{' '}
            {Math.round(minutes(main))} minutes on the main path.
          </p>
        )}
        {detail.status === 'generating' && (
          <p className="mt-2 text-slate-600" aria-live="polite">
            Claude is writing and reviewing it. This page updates by itself.
          </p>
        )}
        {detail.status === 'failed' && <p className="mt-2 text-clay">{detail.error}</p>}
      </header>

      {ep && ctx && detail.review && (
        <>
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">AI review</h3>
            <p className="mt-1 text-slate-600">
              {detail.passed
                ? 'No blocking problems found. You still decide.'
                : `${detail.review.rubric.issues.length} notes are pinned to the lines below. Read them before you decide.`}
              {detail.status === 'in_review' && ' Press Edit on any line to correct its wording.'}
            </p>
            {edited > 0 && (
              <p className="mt-1 font-semibold text-leaf">
                {edited} {edited === 1 ? 'line' : 'lines'} corrected by reviewers. The scores and notes are from before the corrections.
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {CRITERIA.map((c) => {
                const s = detail.review!.rubric.scores[c.key]
                return (
                  <div key={c.key} title={s.reason}>
                    <dt className="text-sm text-slate-500">{c.label}</dt>
                    <dd className={`text-xl font-bold ${scoreTone(s.score)}`}>{s.score}/5</dd>
                  </div>
                )
              })}
            </dl>
            {general.map((n, i) => (
              <IssueNote key={i} issue={n} />
            ))}
          </section>

          <section className="flex flex-wrap gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <div className="min-w-48 flex-1">
              <h3 className="font-semibold">Before class</h3>
              <ul className="mt-1 list-disc pl-5 text-slate-700" lang={ep.school_lang}>
                {ep.materials.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
            <figure>
              <img src={svgDataUrl(ep.chalk_sketch_svg)} alt="Blackboard sketch the teacher draws before class" className="h-28 rounded-lg bg-slate-50 p-2" />
              <figcaption className="mt-1 text-xs text-slate-500">Blackboard sketch</figcaption>
            </figure>
          </section>

          <Script ep={ep} ctx={ctx} />
          <Decision detail={detail} onDecided={(d) => (setDetail(d), onChanged())} onError={onError} />
        </>
      )}
    </article>
  )
}
