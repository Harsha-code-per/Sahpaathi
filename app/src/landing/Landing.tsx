import { ArrowRightIcon, BookOpenCheckIcon, LayoutDashboardIcon, PlayIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { LogoMark } from '@/components/Logo'
import './landing.css'

const REPO = 'https://github.com/Harsha-code-per/Sahpaathi'

/** Number words drifting around the speaker, one per language Sahpaathi speaks. */
const WORDS = [
  { lang: 'ta', text: 'ஒன்று, இரண்டு', pos: 'top-[8%] left-0', delay: '0s' },
  { lang: 'hi', text: 'तीन, चार', pos: 'right-0 bottom-[18%]', delay: '-1.5s' },
  { lang: 'or', text: 'ପାଞ୍ଚ', pos: 'bottom-[4%] left-[14%]', delay: '-3s' },
  { lang: 'sat', text: 'ᱥᱟᱱᱛᱟᱲᱤ', pos: 'top-[24%] right-[2%]', delay: '-4.5s' },
  { lang: 'en', text: 'six, seven', pos: 'top-[52%] -left-[4%]', delay: '-2.2s' },
]

const STEPS = [
  ['Claude writes the lesson', 'From the textbook chapter and the district: local names, crops, festivals and free props like pebbles and seeds.'],
  ['Four checks before class', 'Code recomputes every sum, a second model reviews it, every line is translated back, then a native speaker approves.'],
  ['The class answers', 'After each part the teacher taps most, some or few got it, and the lesson switches to stretch, more practice or easier, on the phone.'],
  ['Nobody left behind', 'Absent children get the recap that evening, as a call to a parent’s basic phone. Keys 1, 2 and 3 answer back.'],
]

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] font-bold tracking-[0.12em] text-primary uppercase">{children}</p>
}

function Stat({ value, children, dark }: { value: string; children: ReactNode; dark?: boolean }) {
  return (
    <div className="space-y-2">
      <p className={`font-heading text-5xl leading-none font-extrabold ${dark ? 'text-[#b5770f]' : 'text-primary'}`}>{value}</p>
      <p className={dark ? 'text-[#55625f]' : 'text-muted-foreground'}>{children}</p>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="theme-board min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-5 md:px-8">
        <a href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LogoMark className="size-6" />
          </span>
          <span className="font-heading text-xl font-bold">Sahpaathi</span>
        </a>
        <div className="flex-1" />
        <a href="#how" className="text-muted-foreground hover:text-foreground max-sm:hidden">
          How it works
        </a>
        <a href="#try" className="inline-flex h-11 items-center rounded-xl bg-foreground px-4 font-semibold text-background hover:bg-foreground/85">
          Try it
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-10 pb-24 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div className="space-y-7">
            <div className="landing-rise">
              <Eyebrow>Offline AI co-teacher · Challenge 01</Eyebrow>
            </div>
            <h1 className="landing-rise font-heading text-display font-extrabold tracking-tight" style={{ animationDelay: '80ms' }}>
              A second teacher, in a ₹500 speaker.
            </h1>
            <p className="landing-rise max-w-xl text-xl leading-relaxed text-muted-foreground" style={{ animationDelay: '160ms' }}>
              While she teaches Grade 3, Sahpaathi teaches Grade 1: a lively audio lesson in the children’s home language that adapts with every tap, with no internet in the room.
            </p>
            <div className="landing-rise flex flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
              <a href="/teacher" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-6 text-lg font-bold text-primary-foreground hover:bg-primary/85">
                <PlayIcon className="size-5" aria-hidden /> Open the teacher app
              </a>
              <a href="#how" className="inline-flex h-14 items-center gap-2 rounded-2xl border border-input px-6 text-lg font-semibold hover:bg-accent">
                See how it works
              </a>
            </div>
          </div>

          <div className="relative mx-auto grid aspect-square w-full max-w-md place-items-center" aria-hidden>
            {[0, 1.2, 2.4].map((d) => (
              <span key={d} className="landing-ring absolute inset-0 rounded-full border-2 border-primary/60" style={{ animationDelay: `${d}s` }} />
            ))}
            <span className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(244,178,62,0.22),transparent_70%)]" />
            <span className="relative grid size-40 place-items-center rounded-full border-2 border-primary bg-[radial-gradient(circle_at_35%_30%,#3a524d,#0f1918)] shadow-[0_0_80px_rgba(244,178,62,0.25)]">
              <span className="size-16 rounded-full border-2 border-input bg-[#0f1918]" />
            </span>
            {WORDS.map((w) => (
              <span
                key={w.lang}
                lang={w.lang}
                className={`landing-drift absolute ${w.pos} rounded-full bg-card/80 px-4 py-2 text-lg font-semibold backdrop-blur`}
                style={{ animationDelay: w.delay } as CSSProperties}
              >
                {w.text}
              </span>
            ))}
          </div>
        </section>

        <section className="bg-[#f2efe6] py-24 text-[#172524]">
          <div className="landing-reveal mx-auto max-w-7xl space-y-12 px-5 md:px-8">
            <h2 className="max-w-3xl font-heading text-4xl leading-tight font-extrabold md:text-5xl">One teacher. Three grades. Two languages. One room.</h2>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <Stat value="1,04,125" dark>
                single-teacher schools in India (UDISE+ 2024–25)
              </Stat>
              <Stat value="24,680" dark>
                villages with no mobile coverage (Department of Telecommunications)
              </Stat>
              <Stat value="0 KB" dark>
                of data Sahpaathi needs during a lesson
              </Stat>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-7xl scroll-mt-8 space-y-12 px-5 py-24 md:px-8">
          <div className="landing-reveal space-y-4">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="max-w-3xl font-heading text-4xl leading-tight font-extrabold md:text-5xl">Written by Claude. Checked four times. Played offline.</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="landing-reveal space-y-3 rounded-3xl border border-border bg-card p-6">
                <p className="font-heading text-5xl font-extrabold text-primary">0{i + 1}</p>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-[#0f1918] py-24">
          <div className="landing-reveal mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-2">
            <div className="space-y-4">
              <Eyebrow>Built for zero signal</Eyebrow>
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
