import { FlameIcon, Trash2Icon, Volume2Icon } from 'lucide-react'
import { useState } from 'react'
import { parentSummary, type Lang } from './api'
import { streak, toRevise, type LearningRecord } from './learning'
import type { useLearning } from './useLearning'

/**
 * "My learning": a switch (off by default), then what they have studied, a streak, the questions to practise
 * again, and a note they can read aloud to a parent. Everything shown stays in this browser.
 */
export function LearningPanel({ learning, onPractise, onSpeak }: { learning: ReturnType<typeof useLearning>; onPractise: (text: string) => void; onSpeak: (text: string, lang: Lang) => void }) {
  const { enabled, records, turn } = learning
  const [note, setNote] = useState<{ id: string; text: string; lang: Lang } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const days = streak(records)
  const revise = toRevise(records)

  async function explain(r: LearningRecord) {
    setBusy(r.id)
    setError('')
    try {
      setNote({ id: r.id, text: await parentSummary({ title: r.title, parts: r.partTitles.slice(0, r.finished ? r.partTitles.length : Math.max(1, r.partsDone)), revise: r.revise, language: r.language }), lang: r.language })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the note. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="My learning" className="space-y-3 rounded-3xl border border-white/15 bg-white/5 p-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => turn(e.target.checked)} className="mt-1 size-5 accent-[#3fb8a0]" />
        <span>
          <b>My learning</b>: remember my lessons on this device
          <span className="block text-sm text-[#a9b8b3]">Off by default. It keeps only lesson titles and the questions to practise, in this browser only, with no name. Turning it off deletes it.</span>
        </span>
      </label>

      {enabled && (
        <>
          {records.length === 0 ? (
            <p className="text-[#a9b8b3]">Finish a lesson with the teacher and it shows up here.</p>
          ) : (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <FlameIcon className="size-5 text-[#f4b23e]" aria-hidden /> {days > 0 ? `${days}-day streak` : 'Come back tomorrow to start a streak'}
              </p>
              <ul className="space-y-2">
                {records.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/5 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{r.title}</span>
                      <span className="text-sm text-[#a9b8b3]">
                        {r.finished ? 'Finished' : `${r.partsDone} of ${r.partTitles.length} parts`} · {r.day}
                      </span>
                    </span>
                    <button type="button" disabled={busy === r.id} onClick={() => explain(r)} className="h-9 rounded-full border border-white/25 px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                      {busy === r.id ? 'Writing…' : 'Explain this to my mother'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {note && (
            <div role="status" className="space-y-2 rounded-2xl bg-[#f2efe6] p-4 text-[#0b1413]">
              <p lang={note.lang} className="whitespace-pre-line text-lg leading-relaxed">
                {note.text}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => onSpeak(note.text, note.lang)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0b1413] px-3 text-sm font-semibold text-[#f2efe6] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Volume2Icon className="size-4" aria-hidden /> Read it aloud
                </button>
                <button type="button" onClick={() => setNote(null)} className="h-9 rounded-full px-3 text-sm font-semibold underline-offset-4 hover:underline">
                  Close
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-[#ffb4a2]">{error}</p>}

          {revise.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">To practise again</p>
              <ul className="space-y-2">
                {revise.map((r) => (
                  <li key={r.item} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5">
                    <span className="min-w-0 flex-1 text-sm">{r.item}</span>
                    <button type="button" onClick={() => onPractise(`Practise: ${r.title}. ${r.item}`)} className="h-9 shrink-0 rounded-full border border-white/25 px-3 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
                      Practise
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {records.length > 0 && (
            <button type="button" onClick={() => confirm('Delete everything My learning has saved on this device?') && turn(false)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-[#a9b8b3] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
              <Trash2Icon className="size-4" aria-hidden /> Delete my learning
            </button>
          )}
        </>
      )}
    </section>
  )
}
