import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import type { Episode } from '../lib/types'
import { ClassroomSetup } from '../attendance/Attendance'
import { getClassroom } from '../attendance/classroom'
import { sharePack } from '../packs/share'
import { deletePack, importPack, listPacks, loadPackFiles } from '../packs/store'
import { PackError } from '../packs/verify'
import type { ClassroomRecord, StoredPack } from '../storage/db'
import { samplePack } from './samplePack'

export interface OpenLesson {
  episode: Episode
  audio: Record<string, string>
}

type Notice = { kind: 'ok' | 'error'; text: string }

function LessonCard(props: { episode: Episode; badge?: string; onOpen: () => void; onShare?: () => void; onRemove?: () => void }) {
  const { episode: e } = props
  return (
    <li className="rounded-2xl bg-white/10 p-4">
      <button className="min-h-16 w-full text-left" onClick={props.onOpen}>
        <span className="block text-xl font-semibold">▶ {e.title}</span>
        <span className="block opacity-80">
          Grade {e.grade} · {e.district} · {e.duration_min} min
        </span>
        {props.badge && <span className="block text-sm text-sun">{props.badge}</span>}
      </button>
      {props.onShare && props.onRemove && (
        <div className="mt-3 flex gap-3">
          <button className="min-h-12 flex-1 rounded-xl bg-white/15 font-semibold" onClick={props.onShare}>
            ↗ Share with a teacher
          </button>
          <button className="min-h-12 rounded-xl px-4 font-semibold text-clay" onClick={props.onRemove}>
            Remove
          </button>
        </div>
      )}
    </li>
  )
}

/** Lesson picker: imported packs (newest first) plus the built-in sample, and the "Add a lesson pack" button. */
export default function Library({ onOpen }: { onOpen: (lesson: OpenLesson) => void }) {
  const [packs, setPacks] = useState<StoredPack[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null)
  const [editingClassroom, setEditingClassroom] = useState(false)

  const refresh = useCallback(
    () =>
      listPacks().then(setPacks, (e) => {
        console.error('Could not list packs', e)
        setNotice({ kind: 'error', text: 'Could not read the lessons saved on this phone.' })
      }),
    [],
  )
  useEffect(() => {
    refresh()
  }, [refresh])
  useEffect(() => {
    getClassroom().then(setClassroom, (e) => console.error('Could not read the classroom', e))
  }, [])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same file again should still fire
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      const pack = await importPack(file)
      setNotice({ kind: 'ok', text: `Added “${pack.episode.title}”.` })
      await refresh()
    } catch (err) {
      if (!(err instanceof PackError)) console.error('Pack import failed', err)
      setNotice({ kind: 'error', text: err instanceof PackError ? err.message : 'Could not add this pack. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function open(p: StoredPack) {
    const files = await loadPackFiles(p.id)
    const audio = Object.fromEntries(
      Object.entries(files?.audio ?? {}).map(([id, bytes]) => [id, URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg; codecs=opus' }))]),
    )
    onOpen({ episode: p.episode, audio })
  }

  async function share(p: StoredPack) {
    const files = await loadPackFiles(p.id)
    if (!files) return setNotice({ kind: 'error', text: 'This lesson’s files are missing. Remove it and add the pack again.' })
    if ((await sharePack(p.id, p.episode.title, files.zip)) === 'saved') {
      setNotice({ kind: 'ok', text: `Saved ${p.id}.sahpaathi to Downloads. Send it from Files, WhatsApp or Bluetooth.` })
    }
  }

  async function remove(p: StoredPack) {
    if (!confirm(`Remove “${p.episode.title}” from this phone?`)) return
    await deletePack(p.id)
    await refresh()
  }

  return (
    <main className="flex min-h-screen flex-col gap-5 bg-ink p-6 text-white">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sun">Sahpaathi</h1>
          <p className="mt-1 opacity-80">Choose today’s lesson</p>
        </div>
        <button className="min-h-14 rounded-xl px-3 text-center text-sm font-semibold opacity-80" onClick={() => setEditingClassroom((v) => !v)}>
          ✏️ Change classroom
        </button>
      </header>

      {editingClassroom && (
        <section className="flex flex-col gap-3">
          <ClassroomSetup
            classroom={classroom}
            onSaved={(c) => {
              setClassroom(c)
              setEditingClassroom(false)
              setNotice({ kind: 'ok', text: `Classroom set to ${c.classroom_id}.` })
            }}
          />
          <button className="min-h-14 rounded-2xl bg-white/15 text-lg" onClick={() => setEditingClassroom(false)}>
            Cancel
          </button>
        </section>
      )}

      <label
        className={`flex min-h-16 items-center justify-center rounded-2xl border-2 border-dashed border-sun text-xl font-semibold text-sun ${busy ? 'opacity-60' : 'cursor-pointer'}`}
      >
        {busy ? 'Checking the pack…' : '📥 Add a lesson pack'}
        <input type="file" accept=".sahpaathi,application/zip" className="hidden" disabled={busy} onChange={onFile} />
      </label>

      {notice && (
        <p role="status" className={`rounded-xl p-4 text-lg ${notice.kind === 'ok' ? 'bg-leaf/25' : 'bg-clay/30'}`}>
          {notice.text}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {packs.map((p) => (
          <LessonCard key={p.id} episode={p.episode} onOpen={() => open(p)} onShare={() => share(p)} onRemove={() => remove(p)} />
        ))}
        <LessonCard episode={samplePack.episode} badge="Built-in sample" onOpen={() => onOpen(samplePack)} />
      </ul>
    </main>
  )
}
