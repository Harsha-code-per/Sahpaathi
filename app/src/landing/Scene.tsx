import { LogoMark } from '@/components/Logo'

const LEVELS = [
  ['Most got it', '#3fb8a0'],
  ['Some got it', '#f4b23e'],
  ['Few got it', '#e8704a'],
] as const

/** A speech-like waveform for the now-playing strip. */
const BARS = [30, 55, 80, 45, 65, 95, 70, 40, 60, 85, 50, 35, 75, 90, 55, 40, 70, 60, 30, 50, 80, 45, 65, 35, 55, 25, 45, 30]

/** The real teacher screen, drawn in HTML so it can tilt in 3D. Decorative: the facts live in the copy beside it. */
function PhoneScreen() {
  return (
    <div aria-hidden className="flex h-full flex-col gap-3 rounded-[2rem] bg-[#172524] p-4 text-[#f2efe6]">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-[#f4b23e] text-[#172524]">
          <LogoMark className="size-4" />
        </span>
        <span className="font-heading text-sm font-bold">Sahpaathi</span>
        <span className="ml-auto rounded-full bg-[#223633] px-2 py-0.5 text-[10px] font-semibold">All synced</span>
      </div>
      <div className="rounded-2xl bg-[#f4b23e] p-4 text-[#172524]">
        <p className="text-[10px] font-bold tracking-widest">BUILT-IN SAMPLE</p>
        <p className="mt-1 font-heading text-lg leading-tight font-bold">Counting to three with pebbles</p>
        <p className="mt-1 text-xs">Grade 1 · Chennai · 5 min</p>
      </div>
      <p className="mt-1 text-xs text-[#a9b8b3]">How did the class do?</p>
      <div className="grid gap-2">
        {LEVELS.map(([label, color]) => (
          <div key={label} className="flex items-center gap-2 rounded-xl bg-[#223633] px-3 py-3 text-sm font-semibold">
            <span className="size-2.5 rounded-full" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-3 rounded-2xl bg-[#223633] p-3">
        <div className="flex items-center justify-between text-[11px] text-[#a9b8b3]">
          <span className="font-semibold text-[#f2efe6]">Part 2 · Touch and count</span>
          <span className="tabular-nums">1:12</span>
        </div>
        <div className="flex h-8 items-center gap-[3px]">
          {BARS.map((b, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: `${b}%`, background: i < 17 ? '#f4b23e' : '#3d5551' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Pinned scene: the phone tilts up out of the page as you scroll (motion.ts drives [data-phone] and [data-float]). */
export default function Scene() {
  return (
    <section data-scene aria-labelledby="scene-title" className="scene relative h-[280dvh]">
      <div className="scene-stage sticky top-0 grid h-dvh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 md:px-8 lg:grid-cols-2">
          <div data-scene-copy className="space-y-5">
            <h2 id="scene-title" className="font-heading text-4xl leading-tight font-extrabold md:text-6xl">
              One phone runs the lesson. One speaker fills the room.
            </h2>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              After each part she taps how the class did. The next part switches on the phone, with no signal needed.
            </p>
            <div aria-hidden className="flex items-center gap-4 pt-2">
              <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" strokeWidth="9" className="stroke-border" />
                <circle data-dial cx="50" cy="50" r="44" fill="none" strokeWidth="9" strokeLinecap="round" stroke="#3fb8a0" strokeDasharray="276.5" strokeDashoffset="36" />
              </svg>
              <div>
                <p className="font-heading text-4xl leading-none font-extrabold tabular-nums">
                  <span data-dialnum>87</span>%
                </p>
                <p className="mt-1 text-sm text-muted-foreground">of a sample class got it (illustration)</p>
              </div>
            </div>
          </div>
          <div className="relative mx-auto grid h-[34rem] w-full max-w-sm place-items-center [perspective:1400px]">
            <div
              data-phone
              className="relative aspect-[9/18.5] w-[15.5rem] rounded-[2.6rem] bg-[#0f1918] p-2 shadow-[0_40px_80px_rgba(23,37,36,0.35)] [transform-style:preserve-3d] md:w-[17rem]"
            >
              <PhoneScreen />
            </div>
            {LEVELS.map(([label, color], i) => (
              <span
                key={label}
                data-float
                aria-hidden
                className={`absolute rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-[0_10px_30px_rgba(23,37,36,0.15)] ${['top-[8%] -left-2', 'top-[44%] -right-4', 'bottom-[30%] -left-6'][i]}`}
              >
                <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
