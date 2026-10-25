import { Volume2Icon, WifiOffIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from './i18n'

/**
 * A short test the teacher plays through the real speaker before class: three rising notes, then a lower
 * one. It is made on the phone (no file, no network) so it works in airplane mode, and it is not recorded.
 */
function playTestSound(onDone: () => void): () => void {
  const ctx = new AudioContext()
  const out = ctx.createGain()
  out.gain.value = 0.6
  out.connect(ctx.destination)
  const notes = [440, 554, 659, 330] // A, C#, E, then a lower E for the back row's ears
  notes.forEach((hz, i) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.frequency.value = hz
    osc.connect(env).connect(out)
    const t0 = ctx.currentTime + i * 0.55
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(1, t0 + 0.05)
    env.gain.linearRampToValueAtTime(0, t0 + 0.5)
    osc.start(t0)
    osc.stop(t0 + 0.52)
  })
  const timer = setTimeout(
    () => {
      void ctx.close()
      onDone()
    },
    notes.length * 550 + 200,
  )
  return () => {
    clearTimeout(timer)
    void ctx.close()
  }
}

/** Help for the teacher in the room: test the speaker, run a lesson in five steps, and what works with no signal. */
export default function Help() {
  const { t } = useT()
  const [playing, setPlaying] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-2xl font-bold">{t.helpTitle}</h1>

      <section aria-label={t.speakerTitle} className="space-y-3 slate-card rounded-2xl p-5">
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold">
          <Volume2Icon className="size-5 text-primary" aria-hidden /> {t.speakerTitle}
        </h2>
        <p className="text-muted-foreground">{t.speakerHint}</p>
        <Button
          size="lg"
          className="w-full"
          disabled={playing}
          onClick={() => {
            setPlaying(true)
            stop.current = playTestSound(() => setPlaying(false))
          }}
        >
          {playing ? t.speakerPlaying : t.speakerPlay}
        </Button>
      </section>

      <section aria-label={t.fiveSteps} className="space-y-3">
        <h2 className="font-heading text-xl font-bold">{t.fiveSteps}</h2>
        <ol className="space-y-3">
          {t.steps.map((step, i) => (
            <li key={i} className="flex gap-3 slate-card rounded-2xl p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-heading font-bold text-primary-foreground">{i + 1}</span>
              <p className="leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="flex gap-3 rounded-2xl bg-secondary p-4 text-muted-foreground">
        <WifiOffIcon className="mt-0.5 size-5 shrink-0" aria-hidden /> {t.worksOffline}
      </p>
    </div>
  )
}
