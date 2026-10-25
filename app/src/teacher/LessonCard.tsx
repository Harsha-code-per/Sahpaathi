import { createPortal } from 'react-dom'
import type { Episode } from '../lib/types'
import { useT } from './i18n'
import './print.css'

/**
 * A one-page card for the lesson: the chalk sketch, what to keep ready, each part with the question to watch
 * for and what each answer does, and the five steps. It is on the page all the time but only shows when printing
 * (print.css), so a teacher can put it on paper before a power cut or hand it to a substitute. No network is used.
 */
export default function LessonCard({ episode }: { episode: Episode }) {
  const { t } = useT()
  const sketch = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(episode.chalk_sketch_svg)}`
  return createPortal(
    <article className="lesson-card" aria-hidden lang={episode.school_lang}>
      <header>
        <h1>{episode.title}</h1>
        <p>{t.lessonMeta(episode.grade, episode.district, episode.duration_min)}</p>
      </header>
      <div className="lc-grid">
        <section>
          <h2>{t.drawOnBoard}</h2>
          <img src={sketch} alt="" />
          {episode.materials.length > 0 && (
            <>
              <h2>{t.keepReady}</h2>
              <ul>
                {episode.materials.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section>
          <h2>{t.cardParts}</h2>
          <ol>
            {episode.segments.map((seg) => (
              <li key={seg.id}>
                <b>{seg.title}</b>
                <span className="q">{seg.checkpoint}</span>
                <span className="then">
                  {t.taps.most} → {t.then.most} · {t.taps.some} → {t.then.some} · {t.taps.few} → {t.then.few}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section>
        <h2>{t.fiveSteps}</h2>
        <ol className="steps">
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <footer>Sahpaathi · {t.worksOffline}</footer>
    </article>,
    document.body,
  )
}
