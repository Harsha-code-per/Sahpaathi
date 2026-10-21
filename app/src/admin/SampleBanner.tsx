import { FlaskConicalIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { insightsApi, type DataView } from './api'

const VIEWS: [DataView, string][] = [
  ['all', 'Real and sample'],
  ['real', 'Real only'],
  ['sample', 'Sample only'],
]

/**
 * Sample classrooms are invented, so wherever they appear this says so, and lets the viewer switch them
 * off. With no sample loaded it offers to load one, so an evaluator can see the screen filled in.
 */
export function SampleBanner(props: { view: DataView; onView: (v: DataView) => void; sampleTaps: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      props.onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const failed = error && (
    <p role="alert" className="basis-full rounded-xl bg-bad px-3 py-2 text-sm text-bad-foreground">
      {error}
    </p>
  )

  if (props.sampleTaps === 0)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4">
        <FlaskConicalIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="flex-1 text-muted-foreground">Want to see this screen with classrooms in it? Load invented, clearly labelled sample classrooms. Real data is never touched.</p>
        <Button variant="outline" disabled={busy} onClick={() => act(insightsApi.loadSample)}>
          Load sample classrooms
        </Button>
        {failed}
      </div>
    )

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f4b23e]/60 bg-[var(--tint-sun)] p-4 text-[#6b4a0a]">
      <FlaskConicalIcon className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <b>Sample data.</b> Part of what you see is <b>invented</b> ({props.sampleTaps} sample taps, classes starting <code>demo-</code>). It is not evidence of impact.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which data to show">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={props.view === v}
            onClick={() => props.onView(v)}
            className="h-11 rounded-full border border-[#6b4a0a]/30 px-3 text-sm font-semibold outline-none hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-[#6b4a0a] aria-pressed:bg-[#6b4a0a] aria-pressed:text-white"
          >
            {label}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={() => confirm('Remove all sample classrooms? Real data is not touched.') && act(insightsApi.removeSample)} className="h-11 rounded-full px-3 text-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          Remove sample data
        </button>
      </div>
      {failed}
    </div>
  )
}
