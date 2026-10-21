import { CheckCircle2Icon, CircleDashedIcon, ExternalLinkIcon, FlaskConicalIcon } from 'lucide-react'
import { useState } from 'react'
import { LogoMark } from '@/components/Logo'
import { cost, DEFAULTS, rupees, type CostInputs } from './costModel'

const REPO = 'https://github.com/Harsha-code-per/Sahpaathi'
const card = 'rounded-3xl border border-border bg-card p-6 shadow-[0_10px_30px_rgba(23,37,36,0.05)]'
const th = 'px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground'
const td = 'px-3 py-3 align-top'

type Data = 'real' | 'lessons' | 'sample' | 'none'
const DATA: Record<Data, string> = {
  real: 'Real: your own session, on your own phone',
  lessons: 'Real: the three lessons reviewed so far',
  sample: 'Sample: invented, and labelled as such',
  none: 'No stored data',
}

const TOUR: { to: string; title: string; look: string; data: Data }[] = [
  { to: '/#modes', title: 'See the two modes', look: 'One classroom mode that needs no internet and one AI-teacher mode that does, side by side.', data: 'none' },
  {
    to: '/teacher',
    title: 'Be the teacher, offline',
    look: 'After the page loads, turn on airplane mode. Open the built-in lesson, tap Most, Some or Few after a part, mark who was absent and rate the lesson, then open “My class”.',
    data: 'real',
  },
  {
    to: '/tutor',
    title: 'Talk to the AI teacher',
    look: 'Say hello, then “teach me place value of two digit numbers”. Answer one question wrongly, say “I’m tired”, then “explain in Hindi”. It plans, teaches, checks, takes a break and switches language.',
    data: 'none',
  },
  {
    to: '/studio',
    title: 'Read a lesson as a reviewer does',
    look: 'Sign in with the demo account (press “Fill in”). Open a lesson: every line sits beside its English back-translation and the AI review. Nothing is voiced until a native speaker approves it.',
    data: 'lessons',
  },
  {
    to: '/admin',
    title: 'See what a block officer sees',
    look: 'Sign in as admin, open Classes. It is empty until phones sync; “Load sample classrooms” fills it with invented, labelled classes so you can see which need a visit and which lesson parts lose children.',
    data: 'sample',
  },
]

const MEASURED: [string, string, string][] = [
  ['Works with no internet', 'Lab-tested in airplane mode: the lesson plays, a tap is saved, attendance is saved, and the queue sends itself once a signal returns.', 'TESTING_LOG L1 and L2 (L2 failed first, then was fixed)'],
  ['Small and fast on a slow phone', 'First visit 96 KB and 6.6 s to the lesson list on emulated slow 3G with a 4× slower CPU; 0.5 s on every later visit.', 'TESTING_LOG L3 and L4'],
  ['Accessible', 'Mobile Lighthouse: accessibility 100, best practices 100 (19 Oct).', 'TESTING_LOG L5'],
  ['Guardrails catch planted defects', '20 of 20 planted defects caught by some tier, 18 of 20 by the strict count (code, or the reviewer pinpointing it). 3 episodes, one run.', 'GUARDRAIL_EVAL.md'],
  ['A voiced lesson is small', 'Three voiced packs of 1.1 to 1.2 MB and about 10 minutes of audio each; two failed the loudness check at first, the build was fixed, all pass.', 'TESTING_LOG V1 to V3'],
  ['What a lesson costs to make', 'About $1 (₹84) to write and review; the 19 Oct batch was $12 for 12 lessons.', 'ROADMAP, “What it costs”'],
]

const NOT_YET: [string, string][] = [
  ['Real teacher interviews', 'The user-testing log is empty. Nothing here is evidence that teachers or children learn more.'],
  ['The speaker at 3 metres', 'The listening test with a ₹500 speaker has not been run; no real phone and speaker test either.'],
  ['Native-speaker review of the app and the voices', 'The Tamil, Hindi and Odia words, including the AI teacher’s, are drafted with Claude and unreviewed.'],
  ['Santali', '0 of 42 phrases are recorded or consented, so it is not offered.'],
  ['A real catch-up call', 'The calling is built and tested on a keypad simulator; no real call has been made.'],
  ['The AI teacher’s answers through the four guardrails', 'It is checked by its rules and prompt only, and judged by Claude.'],
  ['The camera and microphone sensing on real faces', 'Rule-based, opt-in and on-device, tested only with synthetic numbers and a fake camera. Needs legal review (DPDP Act) before children use it.'],
  ['Learner accounts and verifiable parental consent', 'Not built; nothing is saved about the AI teacher’s learners.'],
]

const COMPARE: [string, string, string, string][] = [
  ['One teacher, two or three grades, one room', 'Designed for it: the speaker guides one grade while she teaches another', 'Built for one learner at a screen', 'Built for one viewer at a screen'],
  ['A device for every child', 'No: one phone and one speaker for the room', 'Yes', 'Yes'],
  ['Needs internet while the class is in session', 'No, once the weekly pack is on the phone', 'Yes', 'Yes, unless videos are saved first'],
  ['The teacher’s tap changes the next part', 'Yes: easier, more practice or stretch', 'Not in a classroom', 'No: the video is fixed'],
  ['Home language bridged to the school language by design', 'Yes, lessons start in the home language and bridge across', 'Can translate when asked; not planned as a lesson', 'Depends on the video'],
  ['A native speaker reads it before children hear it', 'Yes: the last of four checks, in the Studio', 'No', 'Varies'],
  ['Reaches a child who was absent, on a basic phone', 'Built: a call plays the recap (not yet tried with a real call)', 'No', 'No'],
]

const DATA_TABLE: [string, string, string][] = [
  ['Which part a class found easy or hard (taps)', 'The teacher’s phone, then the server', 'A classroom code like G2-A. No names.'],
  ['Who was absent', 'The phone, then the catch-up queue', 'Roll numbers only. No names, no phone numbers.'],
  ['The teacher’s rating of a lesson', 'The phone, then the server', 'Stars and fixed tags. No free text from anyone.'],
  ['“My class” history', 'The teacher’s phone only', 'Kept 120 days, clearable with one tap, never uploaded.'],
  ['What you say to the AI teacher', 'Sent to Anthropic’s Claude (and Sarvam for the voice) to answer; Sahpaathi stores nothing', 'The conversation lives in the browser tab and is gone when it closes.'],
  ['Camera and microphone sensing', 'Only on your device, and only if you opt in', 'Never recorded. A few numbers are sent for a moment and not stored. Saved moments are deleted on Stop or after 30 minutes.'],
  ['Children’s names or phone numbers', 'Nowhere', 'Not collected.'],
]

function Calculator() {
  const [i, setI] = useState<CostInputs>(DEFAULTS)
  const c = cost(i)
  const set = (k: keyof CostInputs) => (e: React.ChangeEvent<HTMLInputElement>) => setI({ ...i, [k]: Number(e.target.value) || 0 })
  const fields: [keyof CostInputs, string, string][] = [
    ['classrooms', 'Classrooms', '1'],
    ['languages', 'Languages', '1'],
    ['children', 'Children in a class', '1'],
    ['absentPct', 'Absent each day (%)', '0'],
    ['callMinutes', 'Minutes per catch-up call', '1'],
    ['ratePerMinute', 'Rupees per call minute', '0'],
  ]
  const parts = [
    { label: 'Making the lessons (shared by every classroom)', n: c.content, colour: '#3fb8a0' },
    { label: 'Speaker', n: c.speaker, colour: '#f4b23e' },
    { label: 'Catch-up calls', n: c.calls, colour: '#e8704a' },
    { label: 'Hosting', n: c.hosting, colour: '#6f7fbf' },
  ]
  return (
    <div className={`${card} grid gap-6 lg:grid-cols-[1fr_1.2fr]`}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Cost inputs">
        {fields.map(([k, label, min]) => (
          <label key={k} className="space-y-1 text-sm font-semibold">
            {label}
            <input type="number" inputMode="decimal" min={min} step={k === 'ratePerMinute' ? 0.1 : 1} value={i[k]} onChange={set(k)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        ))}
        <p className="col-span-2 text-sm text-muted-foreground">Exotel does not publish a per-minute rate. Third-party figures run ₹0.50 to ₹1.50, so this is the line to confirm. Defaults match the roadmap’s district row.</p>
      </form>
      <div className="space-y-4" aria-live="polite">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-secondary p-3">
            <p className="font-heading text-3xl font-extrabold tabular-nums">{rupees(c.perChild)}</p>
            <p className="text-sm text-muted-foreground">per child a year</p>
          </div>
          <div className="rounded-2xl bg-secondary p-3">
            <p className="font-heading text-3xl font-extrabold tabular-nums">{rupees(c.perClassroom)}</p>
            <p className="text-sm text-muted-foreground">per classroom</p>
          </div>
          <div className="rounded-2xl bg-secondary p-3">
            <p className="font-heading text-3xl font-extrabold tabular-nums">{rupees(c.perChildWithoutCalls)}</p>
            <p className="text-sm text-muted-foreground">per child without calls</p>
          </div>
        </div>
        <ul className="space-y-2.5">
          {parts.map((p) => (
            <li key={p.label} className="space-y-1">
              <p className="flex justify-between gap-3 text-sm">
                {p.label} <b className="tabular-nums">{rupees(p.n)}</b>
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(100 * p.n) / Math.max(1, c.perClassroom)}%`, background: p.colour }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{Math.round(c.callsPerClassroom)} catch-up calls a classroom a year. Calls are the largest cost at scale; playing the recaps on existing state IVR lines would cut it.</p>
      </div>
    </div>
  )
}

export default function Evidence() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-5 md:px-8">
        <a href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LogoMark className="size-6" />
          </span>
          <span className="font-heading text-xl font-bold">Sahpaathi</span>
        </a>
        <div className="flex-1" />
        <nav aria-label="On this page" className="hidden gap-5 text-muted-foreground md:flex">
          {[
            ['#tour', 'Three minutes'],
            ['#ledger', 'What is measured'],
            ['#cost', 'Cost'],
            ['#why', 'Why not a chatbot'],
            ['#data', 'Your data'],
          ].map(([h, l]) => (
            <a key={h} href={h} className="hover:text-foreground">
              {l}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-16 px-5 pt-6 pb-24 md:px-8">
        <section className="space-y-4">
          <h1 className="max-w-3xl font-heading text-4xl leading-tight font-extrabold md:text-6xl">Don’t take our word for it. Check it.</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            What we have measured, what we have not, what it costs, and exactly what happens to your data. Every number below comes from a document in the repository, and every gap is listed next to it.
          </p>
        </section>

        <section id="tour" className="scroll-mt-8 space-y-5" aria-labelledby="tour-h">
          <h2 id="tour-h" className="font-heading text-3xl font-extrabold">If you only have three minutes</h2>
          <ol className="grid gap-4 md:grid-cols-2">
            {TOUR.map((s, n) => (
              <li key={s.to} className={`${card} flex gap-4`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-heading text-lg font-bold text-primary-foreground">{n + 1}</span>
                <div className="min-w-0 space-y-2">
                  <h3 className="font-heading text-xl font-bold">{s.title}</h3>
                  <p className="text-muted-foreground">{s.look}</p>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {s.data === 'sample' && <FlaskConicalIcon className="size-4 text-[#8a5a00]" aria-hidden />}
                    {DATA[s.data]}
                  </p>
                  <a href={s.to} className="inline-flex items-center gap-1.5 font-semibold text-foreground underline underline-offset-4">
                    Open <code>{s.to}</code> <ExternalLinkIcon className="size-4" aria-hidden />
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="ledger" className="scroll-mt-8 space-y-6" aria-labelledby="ledger-h">
          <h2 id="ledger-h" className="font-heading text-3xl font-extrabold">What is measured, and what is not</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`${card} space-y-4`}>
              <h3 className="flex items-center gap-2 font-heading text-xl font-bold">
                <CheckCircle2Icon className="size-5 text-[#1c7f6c]" aria-hidden /> Measured
              </h3>
              <ul className="space-y-4">
                {MEASURED.map(([what, result, src]) => (
                  <li key={what} className="space-y-1">
                    <p className="font-semibold">{what}</p>
                    <p className="text-muted-foreground">{result}</p>
                    <p className="text-sm">
                      Source: <code>{src}</code>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${card} space-y-4`}>
              <h3 className="flex items-center gap-2 font-heading text-xl font-bold">
                <CircleDashedIcon className="size-5 text-[#8a5a00]" aria-hidden /> Not yet, said plainly
              </h3>
              <ul className="space-y-4">
                {NOT_YET.map(([what, why]) => (
                  <li key={what} className="space-y-1">
                    <p className="font-semibold">{what}</p>
                    <p className="text-muted-foreground">{why}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground">
            The user-testing log, the guardrail evaluation and the cost model are in the repository:{' '}
            <a className="font-semibold text-foreground underline underline-offset-4" href={`${REPO}/tree/main/docs`}>
              docs/
            </a>
            .
          </p>
        </section>

        <section id="cost" className="scroll-mt-8 space-y-5" aria-labelledby="cost-h">
          <h2 id="cost-h" className="font-heading text-3xl font-extrabold">What it costs: try your own numbers</h2>
          <Calculator />
        </section>

        <section id="why" className="scroll-mt-8 space-y-5" aria-labelledby="why-h">
          <h2 id="why-h" className="font-heading text-3xl font-extrabold">Why not just a chatbot or a video?</h2>
          <div className={`${card} overflow-x-auto p-2 sm:p-4`}>
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={th} scope="col" />
                  <th className={`${th} text-foreground`} scope="col">Sahpaathi</th>
                  <th className={th} scope="col">A chatbot</th>
                  <th className={th} scope="col">A video library</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARE.map(([row, a, b, c]) => (
                  <tr key={row}>
                    <th scope="row" className={`${td} text-left font-semibold`}>{row}</th>
                    <td className={`${td} font-medium`}>{a}</td>
                    <td className={`${td} text-muted-foreground`}>{b}</td>
                    <td className={`${td} text-muted-foreground`}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground">These are categories, not claims about any one product. National content platforms such as DIKSHA are a library, not a lesson that runs a room; we plan to publish approved lessons into them, not replace them.</p>
        </section>

        <section id="data" className="scroll-mt-8 space-y-5" aria-labelledby="data-h">
          <h2 id="data-h" className="font-heading text-3xl font-extrabold">What happens to your data</h2>
          <div className={`${card} overflow-x-auto p-2 sm:p-4`}>
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={th} scope="col">What</th>
                  <th className={th} scope="col">Where it goes</th>
                  <th className={th} scope="col">What is kept</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DATA_TABLE.map(([what, where, kept]) => (
                  <tr key={what}>
                    <th scope="row" className={`${td} text-left font-semibold`}>{what}</th>
                    <td className={td}>{where}</td>
                    <td className={`${td} text-muted-foreground`}>{kept}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground">
            Longer version, including the legal gaps (verifiable parental consent under India’s DPDP Act 2023):{' '}
            <a className="font-semibold text-foreground underline underline-offset-4" href={`${REPO}/blob/main/docs/SENSE.md`}>
              docs/SENSE.md
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
