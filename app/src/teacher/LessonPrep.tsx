import type { ReactNode } from 'react'
import type { Episode } from '../lib/types'

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
  // <img> rather than inline markup: an SVG loaded as an image can't run scripts.
  const sketch = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(episode.chalk_sketch_svg)}`

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-sun">Draw on the blackboard</h2>
        <img src={sketch} alt="Chalk sketch for this lesson" className="mt-2 max-h-48 w-full rounded-xl bg-white p-4" />
      </div>

      {episode.materials.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-sun">Keep ready</h2>
          <ul className="mt-2 flex flex-col gap-2 text-lg">
            {episode.materials.map((m) => (
              <li key={m} className="rounded-xl bg-white/10 px-4 py-3">
                ✓ {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {beforeStart}

      <button className="mt-auto min-h-20 rounded-2xl bg-leaf text-2xl font-bold" onClick={onStart}>
        ▶ Start lesson
      </button>
    </section>
  )
}
