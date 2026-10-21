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

/**
 * Plays `url` (the server voice) or, with none, the browser's own voice. Calls `onEnd` when finished or
 * stopped, and `onSilent` if the browser has no voice for this language (the text is on screen anyway).
 * A voice that is missing, or never ends, must not freeze the lesson, so the screen moves on by itself.
 */
export function speak(text: string, lang: Lang, url: string | null, onEnd: () => void, onSilent?: () => void): Speaker {
  let done = false
  const timers: ReturnType<typeof setTimeout>[] = []
  const finish = () => {
    if (done) return
    done = true
    timers.forEach(clearTimeout)
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
    onSilent?.()
    queueMicrotask(finish)
    return { stop: finish }
  }
  // Is there a voice for this language on this device? Browsers fill the list in a moment after loading.
  void voicesReady(synth).then((voices) => {
    if (done) return
    const code = BCP47[lang].slice(0, 2)
    if (!voices.some((v) => v.lang.toLowerCase().replace('_', '-').startsWith(code))) {
      onSilent?.() // the text is on screen; do not mumble it in the wrong language or wait for nothing
      finish()
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = BCP47[lang]
    u.rate = 0.9
    u.onend = finish
    u.onerror = finish
    // Never wait longer than the sentence could take to say, plus a margin.
    timers.push(
      setTimeout(() => {
        synth.cancel()
        finish()
      }, Math.max(5000, text.length * 95 + 3000)),
    )
    try {
      synth.cancel()
      synth.speak(u)
    } catch {
      onSilent?.()
      finish()
    }
  })
  return {
    stop: () => {
      synth.cancel()
      finish()
    },
  }
}

/** The browser's voices, waiting a moment for them to load if the list is still empty. */
function voicesReady(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(synth.getVoices()), 1500)
    synth.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(t)
        resolve(synth.getVoices())
      },
      { once: true },
    )
  })
}
