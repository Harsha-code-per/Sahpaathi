import type { Lang } from './api'

const BCP47: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', or: 'or-IN' }

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

const Ctor = (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
const Recognizer = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition

/** Whether this browser can listen (Chrome, Edge and Safari can; Firefox cannot). Typing always works. */
export const canListen = Boolean(Recognizer)

export interface Listener {
  stop: () => void
}

/** Listens for one spoken sentence. `onText` gets the live words; `onDone` gets the final ones (or '' if nothing heard). */
export function listen(lang: Lang, onText: (live: string) => void, onDone: (final: string, error?: string) => void): Listener {
  const rec = new Recognizer!()
  rec.lang = BCP47[lang]
  rec.interimResults = true
  rec.continuous = false
  let heard = ''
  let error: string | undefined
  let stopped = false
  rec.onresult = (e) => {
    heard = Array.from(e.results, (r) => r[0].transcript).join(' ').trim()
    onText(heard)
  }
  rec.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') error = e.error
  }
  rec.onend = () => {
    if (!stopped) onDone(heard, error)
  }
  rec.start()
  return {
    stop: () => {
      stopped = true
      rec.abort()
    },
  }
}

export interface Speaker {
  stop: () => void
}

/** Plays `url` (the server voice) or, with none, the browser's own voice. Calls `onEnd` when finished or stopped. */
export function speak(text: string, lang: Lang, url: string | null, onEnd: () => void): Speaker {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (url) URL.revokeObjectURL(url)
    onEnd()
  }
  if (url) {
    const audio = new Audio(url)
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
    return {
      stop: () => {
        audio.pause()
        finish()
      },
    }
  }
  const synth = window.speechSynthesis
  if (!synth) {
    queueMicrotask(finish)
    return { stop: finish }
  }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = BCP47[lang]
  u.rate = 0.9
  u.onend = finish
  u.onerror = finish
  try {
    synth.cancel()
    synth.speak(u)
  } catch {
    queueMicrotask(finish) // no usable voice: the text is on screen, so end quietly
  }
  return {
    stop: () => {
      synth.cancel()
      finish()
    },
  }
}
