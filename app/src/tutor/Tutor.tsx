import { ArrowUpIcon, AudioLinesIcon, SquareIcon } from 'lucide-react'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { LogoMark } from '@/components/Logo'
import { chat, speakUrl, type Lang, type Style, type Turn } from './api'
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
const TOPICS = ['Counting to 20', 'Place value', 'Subtraction', 'Multiplying in groups', 'Telling the time']
const OPENER = 'Hello, I am ready to learn.'
const STATUS: Record<Phase, string> = {
  idle: 'Tap the button and talk to your teacher',
  listening: 'Listening… speak now',
  thinking: 'Thinking…',
  speaking: 'Your teacher is speaking. Tap to interrupt',
}

const chip =
  'inline-flex h-10 items-center rounded-full border border-white/25 bg-white/5 px-4 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-[#f2efe6] aria-pressed:bg-[#f2efe6] aria-pressed:text-[#0b1413]'

/** One-to-one spoken tutor (Online Mode prototype): talk, hear the answer, interrupt with a doubt. */
export default function Tutor() {
  const [lang, setLang] = useState<Lang>('en')
  const [style, setStyle] = useState<Style>('normal')
  const [topic, setTopic] = useState('')
  const [turns, setTurns] = useState<Shown[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [live, setLive] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  // Refs mirror what async callbacks need to read after the render that created them.
  const turnsRef = useRef<Shown[]>([])
  const talking = useRef(false) // conversation mode: listen again after every spoken answer
  const generation = useRef(0) // bumps on stop/reset so a late reply is dropped
  const listener = useRef<Listener | null>(null)
  const speaker = useRef<Speaker | null>(null)
  const silences = useRef(0)
  const settings = useRef({ lang, style, topic })
  settings.current = { lang, style, topic }
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => () => halt(), [])
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [turns, live, phase])

  function halt() {
    generation.current++
    talking.current = false
    listener.current?.stop()
    speaker.current?.stop()
    listener.current = speaker.current = null
  }

  function stop() {
    halt()
    setPhase('idle')
    setLive('')
  }

  function startListening() {
    if (!canListen) return setPhase('idle')
    setPhase('listening')
    setLive('')
    listener.current = listen(
      settings.current.lang,
      setLive,
      (said, err) => {
        listener.current = null
        setLive('')
        if (err) {
          talking.current = false
          setPhase('idle')
          setError(err === 'not-allowed' ? 'Please allow the microphone to talk to the teacher, or type below.' : 'I could not hear you. You can type below.')
        } else if (said) {
          silences.current = 0
          void send(said)
        } else if (talking.current && ++silences.current < 3) {
          startListening() // nothing heard: keep the line open for a moment
        } else {
          talking.current = false
          setPhase('idle')
        }
      },
    )
  }

  async function send(text: string, hidden = false) {
    const mine = ++generation.current
    const next = [...turnsRef.current, { role: 'user' as const, content: text, hidden }]
    turnsRef.current = next
    setTurns(next)
    setPhase('thinking')
    setError('')
    try {
      const { lang, style, topic } = settings.current
      const reply = await chat(next.map(({ role, content }) => ({ role, content })), lang, style, topic)
      if (mine !== generation.current) return
      const withReply = [...next, { role: 'assistant' as const, content: reply }]
      turnsRef.current = withReply
      setTurns(withReply)
      setPhase('speaking')
      const url = await speakUrl(reply, lang)
      if (mine !== generation.current) return
      speaker.current = speak(reply, lang, url, () => {
        speaker.current = null
        if (talking.current) startListening()
        else setPhase('idle')
      })
    } catch (e) {
      if (mine !== generation.current) return
      talking.current = false
      setPhase('idle')
      setError(e instanceof Error ? e.message : 'The teacher could not answer. Try again.')
    }
  }

  function press() {
    if (phase === 'idle') {
      talking.current = true
      silences.current = 0
      if (turnsRef.current.length === 0) void send(OPENER, true)
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
    if (!text) return
    setDraft('')
    halt()
    void send(text)
  }

  function newLesson(next: string) {
    halt()
    turnsRef.current = []
    setTurns([])
    setTopic(next)
    settings.current = { ...settings.current, topic: next }
    setPhase('idle')
    setError('')
    setLive('')
  }

  const shown = turns.filter((t) => !t.hidden)
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Topic">
          {TOPICS.map((t) => (
            <button key={t} type="button" className={chip} aria-pressed={topic === t} onClick={() => newLesson(topic === t ? '' : t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
          {shown.length === 0 && (
            <p className="py-10 text-center text-lg text-[#a9b8b3]">
              Pick a language and a topic, or just start talking. Ask a doubt any time, ask for another language, or ask to be taught like you are five.
            </p>
          )}
          {shown.map((t, i) => (
            <p
              key={i}
              lang={t.role === 'assistant' ? lang : undefined}
              className={`max-w-[85%] rounded-3xl px-4 py-3 text-lg leading-relaxed ${t.role === 'user' ? 'ml-auto bg-[#f2efe6] text-[#0b1413]' : 'bg-white/10'}`}
            >
              {t.content}
            </p>
          ))}
          {live && <p className="ml-auto max-w-[85%] rounded-3xl bg-[#f2efe6]/60 px-4 py-3 text-lg text-[#0b1413]">{live}</p>}
          <div ref={end} />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-[#3a1f1a] px-3 py-2 text-[#ffb4a2]">
            {error}
          </p>
        )}
      </main>

      <footer className="sticky bottom-0 mx-auto w-full max-w-3xl space-y-2 bg-gradient-to-t from-[#0b1413] via-[#0b1413] to-transparent px-5 pt-4 pb-5">
        <p className="text-center text-sm text-[#a9b8b3]" aria-live="polite">
          {canListen ? STATUS[phase] : 'This browser cannot listen. Type your question, or open this page in Chrome.'}
        </p>
        <form onSubmit={typed} className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 p-2 pl-5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a question…"
            aria-label="Type a question"
            className="h-11 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[#a9b8b3]"
          />
          {draft.trim() ? (
            <button type="submit" aria-label="Send" className="grid size-12 place-items-center rounded-full bg-[#f2efe6] text-[#0b1413] outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
