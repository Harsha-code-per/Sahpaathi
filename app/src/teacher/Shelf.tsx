import { DownloadIcon, ExternalLinkIcon, FileTextIcon, PlayIcon, SendIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { listPacks } from '../packs/store'
import type { NoteRecord, RecordingRecord } from '../storage/db'
import { useT } from './i18n'
import { deleteNote, formatSize, groupNotes, listNotes, noteProblem, saveNote, storageUsage, titleFromName } from './notes'
import { deleteRecording, listRecordings, newId, sendRecording } from './recordings'
import { samplePacks } from './samplePack'

// The shelf: official books and guides to open, PDFs the teacher keeps on the phone, and every recording she has
// made, filed by subject and grade so she can find a topic again later.

/** Only pages that are known to exist. NCERT's own site is the source of its textbooks; none is copied here. */
const OFFICIAL = [
  { name: 'NCERT textbooks', url: 'https://ncert.nic.in/textbook.php', about: 'Free textbooks for every class, in English, Hindi and Urdu' },
  { name: 'DIKSHA', url: 'https://diksha.gov.in/', about: 'Government lessons, worksheets and teacher courses' },
  { name: 'NIPUN Bharat', url: 'https://dsel.education.gov.in/en/nipun-bharat', about: 'The foundational literacy and numeracy mission and its learning outcomes' },
  { name: 'e-Pathshala', url: 'https://epathshala.nic.in/', about: "NCERT's site and app for textbooks and e-resources" },
]

const field = 'h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring'
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Shelf() {
  const { t } = useT()
  const [part, setPart] = useState<'books' | 'recs'>('books')
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-2xl font-bold">{t.shelfTitle}</h1>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label={t.shelfTitle}>
        {(['books', 'recs'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={part === p}
            onClick={() => setPart(p)}
            className={cn(
              'min-h-12 rounded-xl text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
              part === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {p === 'books' ? t.shelfBooks : t.shelfRecs}
          </button>
        ))}
      </div>
      {part === 'books' ? <Books /> : <Recordings />}
    </div>
  )
}

function Books() {
  const { t } = useT()
  const [notes, setNotes] = useState<NoteRecord[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState<NoteRecord['subject']>('general')
  const [grade, setGrade] = useState(0)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)

  const load = useCallback(async () => {
    setNotes(await listNotes())
    setUsage(await storageUsage())
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load().catch(() => setNotes([]))
  }, [load])

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const problem = noteProblem(f)
    if (problem) return (setFile(null), setMessage({ ok: false, text: problem === 'type' ? t.notePdfOnly : t.noteTooBig }))
    setMessage(null)
    setFile(f)
    setTitle(titleFromName(f.name))
  }

  async function add() {
    if (!file) return
    await saveNote({ id: newId(), title: title.trim() || titleFromName(file.name), subject, grade, size: file.size, blob: file, at: new Date().toISOString() })
    setFile(null)
    setMessage({ ok: true, text: t.noteAdded })
    await load()
  }

  function open(n: NoteRecord) {
    const url = URL.createObjectURL(n.blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }

  async function remove(n: NoteRecord) {
    if (!confirm(t.confirmDeleteItem(n.title))) return
    await deleteNote(n.id)
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label={t.officialTitle} className="space-y-3">
        <h2 className="font-heading text-xl font-bold">{t.officialTitle}</h2>
        <p className="text-muted-foreground">{t.officialHelp}</p>
        <ul className="grid gap-2">
          {OFFICIAL.map((o) => (
            <li key={o.url}>
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="slate-card press flex min-h-16 items-center gap-3 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{o.name}</span>
                  <span className="block text-sm text-muted-foreground">{o.about}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
                  {t.officialOpen} <ExternalLinkIcon className="size-4" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t.addNoteTitle} className="slate-card space-y-3 rounded-2xl p-4">
        <h2 className="font-heading text-xl font-bold">{t.addNoteTitle}</h2>
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input text-lg font-semibold focus-within:ring-2 focus-within:ring-ring hover:border-primary">
          <UploadIcon className="size-5" aria-hidden /> {file ? file.name : t.chooseFile}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={pick} />
        </label>
        {file && (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm font-semibold text-muted-foreground">
              {t.noteTitleLabel}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm font-semibold text-muted-foreground">
                {t.noteSubject}
                <select value={subject} onChange={(e) => setSubject(e.target.value as NoteRecord['subject'])} className={field}>
                  <option value="general">{t.subjectGeneral}</option>
                  <option value="numeracy">{t.subjectNames.numeracy}</option>
                  <option value="literacy">{t.subjectNames.literacy}</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm font-semibold text-muted-foreground">
                {t.noteGrade}
                <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} className={field}>
                  <option value={0}>{t.allGrades}</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                    <option key={g} value={g}>
                      {t.gradeBox(g)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button size="lg" className="w-full" onClick={add}>
              {t.addNote}
            </Button>
          </div>
        )}
        {message && (
          <p role="status" className={cn('rounded-xl p-3', message.ok ? 'bg-ok text-ok-foreground' : 'bg-bad text-bad-foreground')}>
            {message.text}
          </p>
        )}
      </section>

      {notes === null ? null : notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-lg text-muted-foreground">{t.shelfEmpty}</p>
      ) : (
        groupNotes(notes).map((g) => (
          <section key={g.subject} className="space-y-3" aria-label={g.subject === 'general' ? t.subjectGeneral : t.subjectNames[g.subject]}>
            <h2 className="font-heading text-xl font-bold">{g.subject === 'general' ? t.subjectGeneral : t.subjectNames[g.subject]}</h2>
            {g.grades.map((gr) => (
              <div key={gr.grade} className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">{gr.grade === 0 ? t.allGrades : t.gradeBox(gr.grade)}</h3>
                <ul className="grid gap-2">
                  {gr.items.map((n) => (
                    <li key={n.id} className="slate-card flex items-center gap-3 rounded-2xl p-3">
                      <FileTextIcon className="size-6 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{n.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatSize(n.size)} · {day(n.at)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => open(n)}>
                        {t.openNote}
                      </Button>
                      <button
                        type="button"
                        aria-label={`${t.deleteItem}: ${n.title}`}
                        onClick={() => remove(n)}
                        className="grid size-11 shrink-0 place-items-center rounded-lg text-few outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2Icon className="size-5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {usage && <p className="text-sm text-muted-foreground">{t.storageUsed(formatSize(usage.used), formatSize(usage.quota))}</p>}
    </div>
  )
}

function Recordings() {
  const { t } = useT()
  const [recs, setRecs] = useState<RecordingRecord[] | null>(null)
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const urls = useRef<string[]>([])

  const load = useCallback(async () => {
    const [r, packs] = await Promise.all([listRecordings(), listPacks()])
    setRecs(r)
    setTitles(new Map([...samplePacks.map((s) => [s.episode.id, s.episode.title] as const), ...packs.map((p) => [p.episode.id, p.episode.title] as const)]))
  }, [])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load().catch(() => setRecs([]))
    const made = urls.current
    return () => made.forEach((u) => URL.revokeObjectURL(u))
  }, [load])

  const blobUrl = (r: RecordingRecord) => {
    const u = URL.createObjectURL(r.audio)
    urls.current.push(u)
    return u
  }

  function download(r: RecordingRecord) {
    const a = document.createElement('a')
    a.href = blobUrl(r)
    a.download = `${r.episode_id}-${r.at.slice(0, 10)}.${r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm'}`
    a.click()
  }

  async function send(r: RecordingRecord) {
    setNotice(null)
    try {
      await sendRecording(r)
      await load()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t.recSendFailed)
    }
  }

  async function remove(r: RecordingRecord, title: string) {
    if (!confirm(t.confirmDeleteItem(title))) return
    await deleteRecording(r.id)
    if (playing?.id === r.id) setPlaying(null)
    await load()
  }

  if (recs === null) return null
  if (recs.length === 0) return <p className="rounded-2xl border border-dashed border-border p-5 text-center text-lg text-muted-foreground">{t.recsEmpty}</p>

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="alert" className="rounded-2xl bg-warn p-4 text-warn-foreground">
          {notice}
        </p>
      )}
      {groupNotes(recs).map((g) => (
        <section key={g.subject} className="space-y-3" aria-label={t.subjectNames[g.subject]}>
          <h2 className="font-heading text-xl font-bold">{t.subjectNames[g.subject]}</h2>
          {g.grades.map((gr) => (
            <div key={gr.grade} className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">{t.gradeBox(gr.grade)}</h3>
              <ul className="grid gap-3">
                {gr.items.map((r) => {
                  const title = titles.get(r.episode_id) ?? r.episode_id
                  const review = r.review && !('note' in r.review) ? r.review : null
                  return (
                    <li key={r.id} className="slate-card space-y-3 rounded-2xl p-4">
                      <div>
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-muted-foreground">
                          {day(r.at)} · {clock(r.duration_sec)} · {t.recStatus[r.status === 'saved' ? 'saved' : r.status]}
                        </p>
                      </div>
                      {playing?.id === r.id ? (
                        <audio controls autoPlay src={playing.url} className="w-full">
                          <track kind="captions" />
                        </audio>
                      ) : (
                        <Button variant="outline" size="lg" className="w-full" onClick={() => setPlaying({ id: r.id, url: blobUrl(r) })}>
                          <PlayIcon aria-hidden /> {t.recPlayBtn}
                        </Button>
                      )}
                      {review && <p className="text-sm">{review.summary}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => download(r)}>
                          <DownloadIcon aria-hidden /> {t.recDownload}
                        </Button>
                        {r.status === 'saved' && (
                          <Button variant="ghost" size="sm" onClick={() => send(r)}>
                            <SendIcon aria-hidden /> {t.recSendNow}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="ml-auto text-few" onClick={() => remove(r, title)}>
                          <Trash2Icon aria-hidden /> {t.deleteItem}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
