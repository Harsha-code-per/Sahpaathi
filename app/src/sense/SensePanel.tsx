import { DownloadIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { RETENTION_MS, type useSense } from './useSense'

const WORDS: Record<string, string> = {
  focused: 'Focused',
  confused: 'Looks puzzled',
  distracted: 'Mind elsewhere?',
  noisy: 'Noisy around you',
  tired: 'Looks tired',
  uncomfortable: 'Something bothering you?',
}

/** The opt-in, the self-view and the controls for the perception agents. Everything is shown, nothing hidden. */
export function SensePanel({ sense }: { sense: ReturnType<typeof useSense> }) {
  const [asking, setAsking] = useState(false)
  const [allowed, setAllowed] = useState(false) // the learner (or their guardian) has ticked the box
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (video.current) video.current.srcObject = sense.stream
  }, [sense.stream])

  if (sense.status === 'off' || sense.status === 'error') {
    return (
      <section aria-label="Notice how I am doing" className="space-y-3 rounded-3xl border border-white/15 bg-white/5 p-4">
        {!asking ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setAsking(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
              <EyeIcon className="size-4" aria-hidden /> Let the teacher notice how I’m doing
            </button>
            <span className="text-sm text-[#a9b8b3]">Optional. Uses your camera and microphone.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-heading text-lg font-bold">Before you turn this on</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[#cfd8d4]">
              <li>The teacher can notice if you look puzzled, tired or distracted, or if it is noisy around you, and then simply <b>ask</b> if you are okay.</li>
              <li>Your camera and microphone are used <b>only to notice</b>, never to record. Nothing is recorded or saved, and no picture or sound leaves your phone. Only a few small numbers (like “eyebrows lowered” or “background noise”) are sent for a moment and are not stored.</li>
              <li>If you save a moment with “I get it” or “I’m lost”, it stays in this page only and is <b>deleted when you press Stop or after {RETENTION_MS / 60000} minutes</b>, whichever comes first.</li>
              <li>It is only a hint, not a test and not a grade. You can stop it, and delete everything, at any time.</li>
            </ul>
            <label className="flex items-start gap-2 text-[#cfd8d4]">
              <input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} className="mt-1 size-5 accent-[#3fb8a0]" />
              <span>I am 18 or older, <b>or</b> my parent or guardian has allowed me to use this.</span>
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={!allowed} onClick={() => { setAsking(false); void sense.start() }} className="inline-flex h-11 items-center rounded-full bg-[#3fb8a0] px-5 font-semibold text-[#0b1413] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                Allow
              </button>
              <button type="button" onClick={() => setAsking(false)} className="inline-flex h-11 items-center rounded-full border border-white/25 px-5 font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
                Not now
              </button>
            </div>
          </div>
        )}
        {sense.error && <p role="alert" className="text-[#ffb4a2]">{sense.error}</p>}
      </section>
    )
  }

  const state = sense.insight?.state ?? 'focused'
  return (
    <section aria-label="Notice how I am doing" className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/15 bg-white/5 p-3">
      <video ref={video} autoPlay muted playsInline aria-label="Your camera (stays on this device)" className="size-16 -scale-x-100 rounded-2xl bg-black object-cover" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <span className={`size-2.5 rounded-full ${sense.status === 'starting' ? 'animate-pulse bg-[#f4b23e]' : state === 'focused' ? 'bg-[#3fb8a0]' : 'bg-[#f4b23e]'}`} aria-hidden />
          {sense.status === 'starting' ? 'Getting ready… (the first time it loads about 10 MB)' : WORDS[state]}
        </p>
        <p className="text-sm text-[#a9b8b3]">{sense.insight?.reasons.join(' · ') || 'Not recording: your camera and microphone are only read, on this device.'}</p>
        {sense.error && <p className="text-sm text-[#f4d58a]">{sense.error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => sense.label('got_it')} disabled={!sense.insight} className="h-9 rounded-full border border-white/25 px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          I get it
        </button>
        <button type="button" onClick={() => sense.label('confused')} disabled={!sense.insight} className="h-9 rounded-full border border-white/25 px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          I’m lost
        </button>
        {sense.saved > 0 && (
          <button type="button" onClick={sense.exportCsv} aria-label={`Download my ${sense.saved} labelled moments`} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
            <DownloadIcon className="size-4" aria-hidden /> {sense.saved}
          </button>
        )}
        {sense.saved > 0 && (
          <button type="button" onClick={sense.deleteNow} className="h-9 rounded-full px-3 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
            Delete now
          </button>
        )}
        <button type="button" onClick={sense.stop} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
          <EyeOffIcon className="size-4" aria-hidden /> Stop
        </button>
      </div>
    </section>
  )
}
