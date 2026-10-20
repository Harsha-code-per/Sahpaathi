import type { Summary } from '../studio/api'
import { STATUS } from '../studio/view'
import type { EpisodeUsage, PackSummary } from './api'
import { pct, pipeline } from './view'

/**
 * Where every lesson is, from writing to classroom use. Read-only: moving a lesson on means approving it
 * (in the Studio, after reading it) or building its pack (Lesson packs), so each card links there.
 */
export default function Pipeline({ episodes, packs, usage }: { episodes: Summary[]; packs: PackSummary[]; usage: EpisodeUsage[] }) {
  const columns = pipeline(episodes, packs, usage)
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5" aria-labelledby="pipeline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline" className="font-heading text-lg font-bold">
          Lesson pipeline
        </h2>
        <p className="text-sm text-muted-foreground">Open a card to review it or build its pack.</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="grid min-w-[60rem] grid-cols-5 gap-3">
          {columns.map((col, i) => (
            <li key={col.key} className="flex max-h-[30rem] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-muted p-3 [scrollbar-width:thin]">
              <h3 className="sticky -top-3 -mx-3 -mt-3 flex items-center justify-between bg-muted px-3 pt-3 pb-1 font-semibold">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: ['#3d4db7', '#f4b23e', '#3fb8a0', '#0e6f61', '#e8704a'][i % 5] }} />
                  {col.label}
                </span>
                <span className="text-sm text-muted-foreground">{col.cards.length}</span>
              </h3>
              {col.cards.length === 0 && <p className="px-1 text-sm text-muted-foreground">{col.empty}</p>}
              {col.cards.map((c) => (
                <a
                  key={c.episode.id}
                  href={`/studio?episode=${c.episode.id}`}
                  className="block space-y-1.5 rounded-xl border border-border bg-card p-3 outline-none hover:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="line-clamp-2 font-semibold">{c.episode.title ?? c.episode.lesson_id}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{c.episode.district_id}</span>
                    {c.episode.status === 'failed' && <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS.failed.tone}`}>Failed</span>}
                  </span>
                  {c.usage && (
                    <span className="block text-[0.8125rem] text-muted-foreground">
                      {c.usage.taps} taps · {pct(c.usage.pct_most)} most got it
                    </span>
                  )}
                  {c.pack?.size_bytes && <span className="block text-[0.8125rem] text-muted-foreground">Pack signed and ready</span>}
                </a>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
