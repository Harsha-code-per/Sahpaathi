import { ArrowRightIcon, BookOpenCheckIcon, LayoutDashboardIcon, PlayIcon } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LogoMark } from '@/components/Logo'
import './landing.css'
import { setupMotion } from './motion'
import Scene from './Scene'

const REPO = 'https://github.com/Harsha-code-per/Sahpaathi'

/** Number words circling the speaker in 3D, one per language Sahpaathi speaks. */
const WORDS = [
  { lang: 'ta', text: 'ஒன்று, இரண்டு' },
  { lang: 'hi', text: 'तीन, चार' },
  { lang: 'or', text: 'ପାଞ୍ଚ' },
  { lang: 'en', text: 'six, seven' },
]

const STEPS = [
  ['Claude writes the lesson', 'From the textbook chapter and the district: local names, crops, festivals and free props like pebbles and seeds.'],
  ['Four checks before class', 'Code recomputes every sum, a second model reviews it, every line is translated back, then a native speaker approves.'],
  ['The class answers', 'After each part the teacher taps most, some or few got it, and the lesson switches to stretch, more practice or easier, on the phone.'],
  ['Nobody left behind', 'Absent children get the recap that evening, as a call to a parent’s basic phone. Keys 1, 2 and 3 answer back.'],
]

/** The number counts up when scrolled into view (motion.ts reads data-count). The markup always holds the final value. */
function Stat({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p data-count={value} className="font-heading text-5xl leading-none font-extrabold text-[#8a5a00] tabular-nums">{value}</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  )
}

/** Splits a sentence into word spans so motion.ts can reveal it word by word. */
function Words({ text, cls }: { text: string; cls: string }) {
  return text.split(' ').map((w, i) => (
    <span key={i} className={`${cls} inline-block`} {...(cls ? {} : { 'data-hero-word': '' })}>
      {w}&nbsp;
    </span>
  ))
}

/** Marigold is a fill only; text uses ink or the deep marigold (marigold text on the light ground is 1.72:1). */
const LEVELS = [
  { id: 'most', label: 'Most got it', secs: 2.4, color: '#3fb8a0' },
  { id: 'some', label: 'Some got it', secs: 3.6, color: '#f4b23e' },
  { id: 'few', label: 'Few got it', secs: 5.2, color: '#e8704a' },
] as const

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(LEVELS[1])
  useEffect(() => setupMotion(root.current!), [])
  return (
    <div ref={root} className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <div data-hero className="cine relative isolate overflow-hidden bg-[#0b1413] text-[#f2efe6]">
        <div aria-hidden className="cine-light absolute inset-0 -z-10" />
        <div aria-hidden className="cine-beam absolute inset-x-0 top-0 -z-10 h-[70%]" />
        <div aria-hidden className="cine-grain pointer-events-none absolute inset-0 z-10" />
        <div aria-hidden className="cine-vignette pointer-events-none absolute inset-0 z-10" />
        <div aria-hidden data-bar className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[16%] bg-black" />
        <div aria-hidden data-bar className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[16%] bg-black" />

      <header className="relative z-20 mx-auto flex max-w-7xl items-center gap-4 px-5 py-5 md:px-8">
        <a href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LogoMark className="size-6" />
          </span>
          <span className="font-heading text-xl font-bold">Sahpaathi</span>
        </a>
        <div className="flex-1" />
        <a href="#how" className="text-[#a9b8b3] hover:text-[#f2efe6] max-sm:hidden">
          How it works
        </a>
        <a href="#try" className="inline-flex h-11 items-center rounded-xl bg-[#f2efe6] px-4 font-semibold text-[#0b1413] hover:bg-white">
          Try it
        </a>
      </header>

        <section className="relative z-20 mx-auto grid max-w-7xl items-center gap-12 px-5 pt-10 pb-28 md:px-8 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[1.05fr_1fr] lg:pt-12">
          <div data-hero-copy className="space-y-7">
            <h1 className="font-heading text-display font-extrabold tracking-tight">
              <Words text="A second teacher, in a ₹500 speaker." cls="" />
            </h1>
            <p className="landing-rise max-w-xl text-xl leading-relaxed text-[#a9b8b3]" style={{ animationDelay: '160ms' }}>
              While she teaches Grade 3, Sahpaathi teaches Grade 1: a lively audio lesson in the children’s home language that adapts with every tap, with no internet in the room.
            </p>
            <div className="landing-rise flex flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
              <a href="/teacher" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground hover:bg-primary/85">
                <PlayIcon className="size-5" aria-hidden /> Open the teacher app
              </a>
              <a href="#how" className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/25 px-6 text-lg font-semibold hover:bg-white/10">
                See how it works
              </a>
            </div>
            <div className="landing-rise space-y-2" style={{ animationDelay: '320ms' }}>
              <p className="text-sm font-semibold text-[#a9b8b3]">Tap what the class said and watch the sound rings change pace.</p>
              <div role="group" aria-label="How well the class understood" className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={level.id === l.id}
                    onClick={() => setLevel(l)}
                    className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/5 px-4 font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-[#f2efe6] aria-pressed:bg-[#f2efe6] aria-pressed:text-[#0b1413]"
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div data-orb className="spk-stage relative mx-auto aspect-square w-full max-w-lg" aria-hidden>
            <span className="spk-backlight absolute inset-[8%] rounded-full" />
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="spk-wave absolute rounded-full border-2"
                style={{ animationDuration: `${level.secs}s`, animationDelay: `${(d * level.secs) / 3}s`, borderColor: level.color }}
              />
            ))}
            <div data-speaker className="spk">
              <span className="spk-body">
                <span className="spk-grille" />
                <span className="spk-led" />
              </span>
              <span className="spk-cap" />
              <span className="spk-base" />
            </div>
            <div className="spk-orbit">
              {WORDS.map((w, i) => (
                <span key={w.lang} className="spk-slot" style={{ '--a': `${(360 / WORDS.length) * i}deg` } as CSSProperties}>
                  <span lang={w.lang} className="spk-word">
                    {w.text}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <main>
        <Scene />

        <section className="bg-[#f2efe6] py-24 text-[#172524]">
          <div className="mx-auto max-w-7xl space-y-12 px-5 md:px-8">
            <h2 data-statement className="max-w-3xl font-heading text-4xl leading-tight font-extrabold md:text-5xl">
              <Words text="One teacher. Three grades. Two languages. One room." cls="w" />
            </h2>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <Stat value="1,04,125">
                single-teacher schools in India (UDISE+ 2024–25)
              </Stat>
              <Stat value="24,680">
                villages with no mobile coverage (Department of Telecommunications)
              </Stat>
              <Stat value="0 KB">
                of data Sahpaathi needs during a lesson
              </Stat>
            </div>
          </div>
        </section>

        <section id="how" data-hscroll className="scroll-mt-8 overflow-hidden py-24">
          <div className="mx-auto max-w-7xl space-y-12 px-5 md:px-8">
            <div className="space-y-4">
              <h2 className="max-w-3xl font-heading text-4xl leading-tight font-extrabold md:text-5xl">Written by Claude. Checked four times. Played offline.</h2>
            </div>
            <ol data-track className="grid gap-4 sm:grid-cols-2 lg:flex lg:w-max lg:gap-6">
              {STEPS.map(([title, text], i) => (
                <li key={title} data-step className="space-y-3 rounded-3xl border border-border bg-card p-6 shadow-[0_10px_30px_rgba(23,37,36,0.06)] lg:w-[26rem] lg:shrink-0 lg:space-y-5 lg:p-9">
                  <p className="font-heading text-5xl font-extrabold text-[#8a5a00] lg:text-7xl">0{i + 1}</p>
                  <h3 className="text-lg font-bold lg:text-2xl">{title}</h3>
                  <p className="leading-relaxed text-muted-foreground lg:text-lg">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-border bg-card py-24">
          <div className="landing-reveal mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-heading text-4xl leading-tight font-extrabold md:text-5xl">Measured on slow 3G and a slow phone.</h2>
              <p className="text-muted-foreground">Lessons, branches, the analogy button and attendance all work in airplane mode. Taps and attendance send themselves when a signal returns.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              <Stat value="0.5 s">to open, every day after the first</Stat>
              <Stat value="96 KB">for the first visit</Stat>
              <Stat value="20 s">to sync once a signal returns</Stat>
            </div>
          </div>
        </section>

        <section id="try" className="mx-auto max-w-7xl scroll-mt-8 space-y-10 px-5 py-24 md:px-8">
          <div className="landing-reveal space-y-4 text-center">
            <h2 className="font-heading text-4xl font-extrabold md:text-6xl">Try it in your browser.</h2>
            <p className="text-lg text-muted-foreground">Demo accounts for the teacher, reviewer and admin are in the README.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['/teacher', PlayIcon, 'Teacher app', 'Play a lesson, tap the checkpoints, take attendance. Works offline.'],
                ['/studio', BookOpenCheckIcon, 'Studio', 'Read a Claude-written lesson line by line with its review, then approve it.'],
                ['/admin', LayoutDashboardIcon, 'Admin', 'Lesson pipeline, how classrooms are doing, and the catch-up call simulator.'],
              ] as const
            ).map(([href, Icon, title, text]) => (
              <a key={href} href={href} className="landing-reveal group space-y-3 rounded-3xl border border-border bg-card p-6 outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring">
                <Icon className="size-7 text-primary" aria-hidden />
                <h3 className="flex items-center gap-2 text-xl font-bold">
                  {title} <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                </h3>
                <p className="text-muted-foreground">{text}</p>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 border-t border-border px-5 py-8 text-sm text-muted-foreground md:px-8">
        <span>Team A1pha · AI for Foundational Learning Hackathon 2026</span>
        <div className="flex-1" />
        <a href={REPO} className="underline-offset-4 hover:text-foreground hover:underline">
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}
