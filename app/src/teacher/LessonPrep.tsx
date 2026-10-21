import { CheckIcon, PlayIcon, PrinterIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Episode } from '../lib/types'
import LessonCard from './LessonCard'
import { useT } from './i18n'

/** Before-class screen: what to gather and what to draw on the blackboard, then Start. */
export default function LessonPrep({
  episode,
  onStart,
  beforeStart,
}: {
  episode: Episode
  onStart: () => void
  /** Rendered just above Start (e.g. the choral mic toggle), so it is seen before the lesson begins. */
  beforeStart?: ReactNode
}) {
  const { t } = useT()
  // <img> rather than inline markup: an SVG loaded as an image can't run scripts.
  const sketch = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(episode.chalk_sketch_svg)}`

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <h2 className="text-[0.8125rem] font-bold tracking-[0.08em] text-primary uppercase">{t.drawOnBoard}</h2>
        <img src={sketch} alt={t.sketchAlt} className="max-h-48 w-full rounded-2xl bg-[#f2efe6] p-4" />
      </div>

      {episode.materials.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[0.8125rem] font-bold tracking-[0.08em] text-primary uppercase">{t.keepReady}</h2>
          <ul className="flex flex-col gap-2 text-lg" lang={episode.school_lang}>
            {episode.materials.map((m) => (
              <li key={m} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <CheckIcon className="size-5 shrink-0 text-most" aria-hidden /> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {beforeStart}

      <Button variant="ghost" onClick={() => window.print()}>
        <PrinterIcon aria-hidden /> {t.printCard}
      </Button>
      <LessonCard episode={episode} />

      <Button size="lg" className="mt-auto h-16 text-xl" onClick={onStart}>
        <PlayIcon className="size-6" aria-hidden /> {t.startLesson}
      </Button>
    </section>
  )
}
