import { ArrowUpIcon, AudioLinesIcon, BookOpenIcon, CheckIcon, PaperclipIcon, SquareIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { LogoMark } from '@/components/Logo'
import { FRESH, makePlan, readAttachment, speakUrl, turn, type Attachment, type Lang, type Plan, type Progress, type Style, type Turn } from './api'
import MemoryGame from './MemoryGame'
import { canListen, listen, speak, type Listener, type Speaker } from './speech'
import './tutor.css'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'
type Shown = Turn & { hidden?: boolean }

const LANGS: [Lang, string][] = [
  ['en', 'English'],
  ['hi', 'हिंदी'],
  ['ta', 'தமிழ்'],
  ['or', 'ଓଡ଼ିଆ'],
]
const OPENER = 'Hello, I am ready to learn.'
const STATUS: Record<Phase, string> = {
  idle: 'Tap the button and talk to your teacher',
  listening: 'Listening… speak now',
  thinking: 'Thinking…',
  speaking: 'Your teacher is speaking. Tap to interrupt',
}
const QUICK: [string, string][] = [
  ['Explain again', 'Please explain this again, I did not understand.'],
  ['Like I’m 5', 'Please explain it like I am five years old.'],
  ['I’m ready', 'I am ready.'],
  ['I need a break', 'I am tired, I need a break.'],
]
const BREAKS: [string, string][] = [
  ['🧩 Riddle', 'Give me a riddle.'],
  ['➕ Quick maths', 'Let us do quick maths.'],
  ['🔢 Number pattern', 'Give me a number pattern puzzle.'],
  ['🃏 Memory game', 'Let us play the memory game.'],
  ['🧘 Stretch', 'Let us do a stretch.'],
  ['Back to lesson', 'Back to the lesson please.'],
]

const chip =
  'inline-flex h-10 items-center rounded-full border border-white/25 bg-white/5 px-4 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-[#f2efe6] aria-pressed:bg-[#f2efe6] aria-pressed:text-[#0b1413]'

/**
 * One-to-one spoken teacher. It starts as a normal conversation. In Study mode (or with a file attached)
 * it analyses the topic into parts and teaches them in order, checking each, as the server's rules dictate.
 */
export default function Tutor() {
  const [lang, setLang] = useState<Lang>('en')
  const [style, setStyle] = useState<Style>('normal')
  const [study, setStudy] = useState(false)
  const [attached, setAttached] = useState<Attachment | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [progress, setProgress] = useState<Progress>(FRESH)
  const [turns, setTurns] = useState<Shown[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [note, setNote] = useState('')
  const [live, setLive] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  // Refs mirror what async callbacks need to read after the render that created them.
  const turnsRef = useRef<Shown[]>([])
  const planRef = useRef<Plan | null>(null)
  const progressRef = useRef<Progress>(FRESH)
  const talking = useRef(false) // conversation mode: listen again after every spoken answer
  const generation = useRef(0) // bumps on stop/restart so a late reply is dropped
  const listener = useRef<Listener | null>(null)
  const speaker = useRef<Speaker | null>(null)
  const silences = useRef(0)
  const planning = useRef(false) // a lesson plan is being made: keep the microphone closed until it is ready
  const settings = useRef({ lang, style, study, attached })
  useEffect(() => {
    settings.current = { lang, style, study, attached }
  }, [lang, style, study, attached])
  const end = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      generation.current++ // leaving the page: drop late replies and stop the mic and the voice
      talking.current = false
      listener.current?.stop()
      speaker.current?.stop()
    },
    [],
  )
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [turns, live, phase, plan])

  function halt() {
    generation.current++
    planning.current = false
    talking.current = false
    listener.current?.stop()
    speaker.current?.stop()
    listener.current = speaker.current = null
  }

  function stop() {
    halt()
    setPhase('idle')
    setLive('')
    setNote('')
  }

  function add(t: Shown) {
    turnsRef.current = [...turnsRef.current, t]
    setTurns(turnsRef.current)
  }

  function startListening() {
    if (!canListen) return setPhase('idle')
    setPhase('listening')
    setLive('')
    listener.current = listen(settings.current.lang, setLive, (said, err) => {
      listener.current = null
      setLive('')
      if (err) {
        talking.current = false
        setPhase('idle')
        setError(err === 'not-allowed' ? 'Please allow the microphone to talk to the teacher, or type below.' : 'I could not hear you. You can type below.')
      } else if (said) {
        silences.current = 0
        void submit(said)
      } else if (talking.current && ++silences.current < 3) {
        startListening() // nothing heard: keep the line open for a moment
      } else {
        talking.current = false
        setPhase('idle')
      }
    })
  }

  /** Speaks a reply (server voice, else the browser's), then listens again if the conversation is open. */
  async function say(reply: string, mine: number) {
    setPhase('speaking')
    const url = await speakUrl(reply, settings.current.lang)
    if (mine !== generation.current) return
    speaker.current = speak(reply, settings.current.lang, url, () => {
      speaker.current = null
      if (planning.current) setPhase('thinking')
      else if (talking.current) startListening()
      else setPhase('idle')
    })
  }

  function fail(e: unknown, mine: number) {
    if (mine !== generation.current) return
    talking.current = false
    setPhase('idle')
    setNote('')
    setError(e instanceof Error ? e.message : 'The teacher could not answer. Try again.')
  }

  /** Whatever the student said or typed: starts a study plan when asked to, else carries on the conversation. */
  async function submit(text: string, hidden = false) {
    const { study, attached } = settings.current
    if (!planRef.current && (study || attached)) return startStudy(text, attached)
    return converse(text, false, hidden)
  }

  async function converse(text: string, begin: boolean, hidden = false) {
    const mine = ++generation.current
    const prior = turnsRef.current.map(({ role, content }) => ({ role, content }))
    if (text) add({ role: 'user', content: text, hidden })
    setPhase('thinking')
    setError('')
    try {
      const { lang, style } = settings.current
      const out = await turn({ messages: prior, text, begin, plan: planRef.current, progress: progressRef.current, language: lang, style })
      if (mine !== generation.current) return
      progressRef.current = out.progress
      setProgress(out.progress)
      if (out.language !== lang) setLang(out.language)
      if (out.style !== style) setStyle(out.style)
      settings.current = { ...settings.current, lang: out.language, style: out.style }
      add({ role: 'assistant', content: out.reply })
      if (out.progress.mode === 'chat' && planRef.current) {
        planRef.current = null // the lesson ended: back to plain conversation
        setPlan(null)
      }
      if (out.start_study !== null) {
        planning.current = true
        await say(out.reply, mine)
        if (mine === generation.current) await startStudy(out.start_study, settings.current.attached, false)
        else planning.current = false
      } else {
        await say(out.reply, mine)
      }
    } catch (e) {
      fail(e, mine)
    }
  }

  /** Analyses the topic or file into parts (about 15 seconds), then begins part 1. */
  async function startStudy(topic: string, doc: Attachment | null, echo = true) {
    planning.current = true
    const mine = ++generation.current
    if (echo) speaker.current?.stop()
    setPhase('thinking')
    setNote('Preparing your lesson plan… this takes about 15 seconds')
    setError('')
    if (echo && topic) add({ role: 'user', content: topic })
    else if (echo && doc) add({ role: 'user', content: `Teach me from ${doc.name}` })
    try {
      const { lang, style } = settings.current
      const made = await makePlan(topic, doc, lang, style)
      if (mine !== generation.current) {
        planning.current = false
        return
      }
      planRef.current = made
      setPlan(made)
      setAttached(null)
      setStudy(false)
      settings.current = { ...settings.current, attached: null, study: false }
      progressRef.current = { ...FRESH, mode: 'teach' }
      setProgress(progressRef.current)
      setNote('')
      planning.current = false
      await converse('', true)
    } catch (e) {
      planning.current = false
      fail(e, mine)
    }
  }

  function press() {
    if (phase === 'idle') {
      talking.current = true
      silences.current = 0
      if (turnsRef.current.length === 0) void converse(OPENER, false, true)
      else startListening()
    } else if (phase === 'speaking') {
      speaker.current?.stop() // interrupt: the end handler opens the microphone
    } else {
      stop()
    }
  }

  function typed(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (!text && !attached) return
    setDraft('')
    halt()
    void submit(text)
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setAttached(await readAttachment(f))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that file.')
    }
  }

  function quick(text: string) {
    halt()
    talking.current = true
    void submit(text)
  }

  const shown = turns.filter((t) => !t.hidden)
  const part = plan?.parts[progress.part]
  const inLesson = plan && (progress.mode === 'teach' || progress.mode === 'quiz')
  const onBreak = plan && (progress.mode === 'break' || progress.mode === 'game')
  return (
    <div className="flex min-h-dvh flex-col bg-[#0b1413] text-[#f2efe6]">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-4">
        <a href="/" className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LogoMark className="size-6" />
          </span>
          <span className="font-heading text-xl font-bold">Ask the teacher</span>
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
          {LANGS.map(([code, label]) => (
            <button key={code} type="button" className={chip} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
          <button type="button" className={chip} aria-pressed={style === 'simple'} onClick={() => setStyle(style === 'simple' ? 'normal' : 'simple')}>
            Explain like I’m 5
          </button>
        </div>

        {plan && (
          <section aria-label="Lesson plan" className="space-y-2 rounded-3xl border border-white/15 bg-white/5 p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="font-heading text-lg font-bold">{plan.title}</h2>
              <span className="text-sm text-[#a9b8b3]">about {plan.parts.reduce((m, p) => m + p.minutes, 0)} min</span>
              <button type="button" onClick={() => { stop(); planRef.current = null; progressRef.current = FRESH; setPlan(null); setProgress(FRESH) }} className="ml-auto text-sm text-[#a9b8b3] underline-offset-4 hover:underline">
                End lesson
              </button>
            </div>
            <ol className="space-y-1">
              {plan.parts.map((p, i) => {
                const done = progress.mode === 'done' || i < progress.part
                const now = !done && i === progress.part
                return (
                  <li key={p.title} className={`flex items-center gap-2 text-base ${now ? 'font-semibold text-[#f4b23e]' : done ? 'text-[#3fb8a0]' : 'text-[#a9b8b3]'}`} aria-current={now ? 'step' : undefined}>
                    <span className="grid size-5 place-items-center rounded-full border border-current text-xs">{done ? <CheckIcon className="size-3" aria-hidden /> : i + 1}</span>
                    {p.title}
                    {now && inLesson && part && (
                      <span className="ml-auto text-sm font-normal">{progress.mode === 'quiz' ? `Question ${progress.q + 1} of ${part.quiz.length}` : 'Learning'}</span>
                    )}
                    {now && onBreak && <span className="ml-auto text-sm font-normal">☕ Break time</span>}
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {progress.mode === 'game' && progress.game?.kind === 'memory' && (
          <MemoryGame onDone={(tries) => void submit(`I finished the memory game in ${tries} tries.`)} />
        )}

        <div className="flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
          {shown.length === 0 && (
            <p className="py-10 text-center text-lg text-[#a9b8b3]">
              Just talk, like to a person. To learn something, turn on <b>Study</b> and say the topic, or attach a chapter, a PDF or a photo of a page. I will split it into parts, teach each one, ask you questions, and teach it again until you get it.
            </p>
          )}
          {shown.map((t, i) => (
            <p
              key={i}
              lang={t.role === 'assistant' ? lang : undefined}
              className={`max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-3 text-lg leading-relaxed ${t.role === 'user' ? 'ml-auto bg-[#f2efe6] text-[#0b1413]' : 'bg-white/10'}`}
            >
              {t.content}
            </p>
          ))}
          {live && <p className="ml-auto max-w-[85%] rounded-3xl bg-[#f2efe6]/60 px-4 py-3 text-lg text-[#0b1413]">{live}</p>}
          {note && <p className="text-center text-[#a9b8b3]">{note}</p>}
          <div ref={end} />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-[#3a1f1a] px-3 py-2 text-[#ffb4a2]">
            {error}
          </p>
        )}
      </main>

      <footer className="sticky bottom-0 mx-auto w-full max-w-3xl space-y-2 bg-gradient-to-t from-[#0b1413] via-[#0b1413] to-transparent px-5 pt-4 pb-5">
        {onBreak && (
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Break choices">
            {BREAKS.filter(([label]) => progress.mode === 'break' || label === 'Back to lesson').map(([label, text]) => (
              <button key={label} type="button" className={chip} onClick={() => quick(text)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {inLesson && (
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Ask the teacher">
            {QUICK.filter(([label]) => label !== 'I’m ready' || progress.mode === 'teach').map(([label, text]) => (
              <button key={label} type="button" className={chip} onClick={() => quick(text)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {attached && (
          <p className="flex items-center justify-center gap-2 text-sm text-[#a9b8b3]">
            <PaperclipIcon className="size-4" aria-hidden /> {attached.name}
            <button type="button" aria-label="Remove file" onClick={() => setAttached(null)} className="rounded-full p-1 hover:bg-white/10">
              <XIcon className="size-4" aria-hidden />
            </button>
          </p>
        )}
        <p className="text-center text-sm text-[#a9b8b3]" aria-live="polite">
          {study && !plan ? 'Study mode: say or type what you want to learn' : canListen ? STATUS[phase] : 'This browser cannot listen. Type your question, or open this page in Chrome.'}
        </p>
        <form onSubmit={typed} className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 p-2 pl-2">
          <input ref={file} type="file" accept="application/pdf,image/*,.txt,text/plain" onChange={pick} className="sr-only" aria-label="Attach a file" tabIndex={-1} />
          <button type="button" aria-label="Attach a PDF, photo or text file" onClick={() => file.current?.click()} className="grid size-10 place-items-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
            <PaperclipIcon className="size-5" aria-hidden />
          </button>
          <button type="button" aria-pressed={study} onClick={() => setStudy(!study)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-[#f2efe6] aria-pressed:text-[#0b1413]">
            <BookOpenIcon className="size-4" aria-hidden /> Study
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={study ? 'What do you want to learn?' : 'Type a message…'}
            aria-label="Type a message"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 text-lg outline-none placeholder:text-[#a9b8b3]"
          />
          {draft.trim() || attached ? (
            <button type="submit" aria-label={attached ? 'Teach me from this file' : 'Send'} className="grid size-12 place-items-center rounded-full bg-[#f2efe6] text-[#0b1413] outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowUpIcon className="size-6" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={press}
              aria-label={phase === 'idle' ? 'Start talking to the teacher' : phase === 'speaking' ? 'Interrupt the teacher' : 'Stop'}
              data-phase={phase}
              className="tutor-voice relative grid size-12 place-items-center rounded-full bg-[#3fb8a0] text-[#0b1413] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {phase === 'idle' ? <AudioLinesIcon className="size-6" aria-hidden /> : phase === 'thinking' ? <span className="tutor-dots" aria-hidden /> : phase === 'listening' ? <SquareIcon className="size-5 fill-current" aria-hidden /> : <AudioLinesIcon className="tutor-bars size-6" aria-hidden />}
            </button>
          )}
        </form>
      </footer>
    </div>
  )
}
