import { CheckCircle2Icon, StarIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { FEEDBACK_TAGS, type FeedbackTag } from '../storage/db'
import { recordFeedback } from '../sync/outbox'
import { useT } from './i18n'

/**
 * "Was this lesson clear?" after a lesson: 1 to 5 stars and a few tags. It is saved in the phone's outbox like a
 * tap, so it works with no signal and is sent later. It asks for no name and no free text, and it can be skipped.
 */
export default function LessonFeedback({ episodeId, onSaved }: { episodeId: string; onSaved: () => void }) {
  const { t } = useT()
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState<FeedbackTag[]>([])
  const [state, setState] = useState<'asking' | 'sent' | 'skipped'>('asking')

  if (state === 'skipped') return null
  if (state === 'sent')
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-ok px-4 py-3 text-ok-foreground">
        <CheckCircle2Icon className="size-5 shrink-0" aria-hidden /> {t.feedbackThanks}
      </p>
    )

  const send = async () => {
    try {
      await recordFeedback({ episode_id: episodeId, rating, tags })
      setState('sent')
      onSaved()
    } catch (e) {
      console.error('Could not queue feedback', e) // the lesson is over; never block the teacher on this
      setState('skipped')
    }
  }

  return (
    <section aria-label={t.feedbackTitle} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-heading text-lg font-bold">{t.feedbackTitle}</h3>
      <div role="radiogroup" aria-label={t.feedbackTitle} className="flex justify-between gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t.feedbackStars(n)}
            onClick={() => setRating(n)}
            className="grid size-12 flex-1 place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StarIcon className={cn('size-8', n <= rating ? 'fill-primary text-primary' : 'text-muted-foreground')} aria-hidden />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <ul className="flex flex-wrap gap-2">
            {FEEDBACK_TAGS.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  aria-pressed={tags.includes(tag)}
                  onClick={() => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]))}
                  className="inline-flex min-h-10 items-center rounded-full border border-input px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {t.feedbackTags[tag]}
                </button>
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" onClick={send}>
            {t.feedbackSend}
          </Button>
        </>
      )}
      <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setState('skipped')}>
        {t.feedbackSkip}
      </Button>
    </section>
  )
}
