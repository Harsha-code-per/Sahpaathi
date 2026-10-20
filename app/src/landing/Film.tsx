import { useEffect, useRef } from 'react'

/** Three clips tell the story; scroll crossfades them (motion.ts). Beat copy stays true to the product. */
const BEATS = [
  ['01', 'A speaker on the windowsill, a lesson in the home language.'],
  ['02', 'Words bridge into the school language, as the class listens.'],
  ['03', 'One tap from the teacher, and the lesson adapts.'],
]

export default function Film() {
  const root = useRef<HTMLElement>(null)

  // Play only while on screen; under reduced motion the posters stay still.
  useEffect(() => {
    const vids = root.current!.querySelectorAll('video')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(([e]) => vids.forEach((v) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause())))
    io.observe(root.current!)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={root} data-film aria-label="How a lesson feels in the room" className="film relative h-[320dvh]">
      <div className="film-stage sticky top-0 h-dvh overflow-hidden bg-[#f2efe6]">
        {[1, 2, 3].map((n) => (
          <video
            key={n}
            data-film-clip
            className="film-clip absolute inset-0 size-full object-cover"
            src={`/media/landing-${n}.mp4`}
            poster={`/media/landing-${n}.jpg`}
            muted
            loop
            playsInline
            preload={n === 1 ? 'auto' : 'metadata'}
            aria-hidden
          />
        ))}
        {/* Light veil so the beat card and nav always read, never a dark scrim. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#f8f6ef]/70 via-transparent to-transparent" />
        <ol className="absolute inset-x-5 bottom-8 md:inset-x-8 md:bottom-12">
          {BEATS.map(([n, text]) => (
            <li
              key={n}
              data-film-beat
              className="film-beat absolute bottom-0 max-w-lg rounded-3xl border border-border bg-card/90 p-6 shadow-[0_20px_50px_rgba(23,37,36,0.15)] md:left-[max(2rem,calc((100vw-80rem)/2+2rem))]"
            >
              <p className="font-heading text-sm font-bold tracking-[0.12em] text-[#8a5a00]">{n} / 03</p>
              <p className="mt-2 font-heading text-2xl leading-snug font-bold md:text-3xl">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
