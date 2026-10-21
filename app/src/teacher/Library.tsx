import { CloudCheckIcon, CloudDownloadIcon, CloudUploadIcon, DownloadIcon, PencilIcon, PlayIcon, Share2Icon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { cn } from 'cn'
import { LogoMark } from '@/components/Logo'
import { ModeSwitch } from '@/components/ModeSwitch'
import { Button } from '@/components/ui/button'
import type { Episode } from '../lib/types'
import { ClassroomSetup } from '../attendance/Attendance'
import { getClassroom } from '../attendance/classroom'
import { sharePack } from '../packs/share'
import { deletePack, importPack, listPacks, loadPackFiles } from '../packs/store'
import { PackError } from '../packs/verify'
import type { ClassroomRecord, StoredPack } from '../storage/db'
import GetLessons from './GetLessons'
import { useT } from './i18n'
import { UI_LANGS, type UiLang } from './strings'
import { samplePack } from './samplePack'

export interface OpenLesson {
  episode: Episode
  audio: Record<string, string>
}

type Notice = { kind: 'ok' | 'error'; text: string }

/** "All synced" or how many taps and attendance saves wait for a signal. */
export function SyncBadge({ pending }: { pending: number | null }) {
  const { t } = useT()
  if (pending === null) return null
  return pending ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn px-2.5 py-1 whitespace-nowrap text-[0.8125rem] font-semibold text-warn-foreground">
      <CloudUploadIcon className="size-4" aria-hidden /> {t.toSync(pending)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok px-2.5 py-1 whitespace-nowrap text-[0.8125rem] font-semibold text-ok-foreground">
      <CloudCheckIcon className="size-4" aria-hidden /> {t.synced}
    </span>
  )
}

function LessonCard(props: { episode: Episode; badge?: string; featured?: boolean; onOpen: () => void; onShare?: () => void; onRemove?: () => void }) {
  const { episode: e } = props
  const { t } = useT()
  const meta = t.lessonMeta(e.grade, e.district, e.duration_min)
  if (props.featured)
    return (
      <li className="space-y-3 rounded-3xl bg-primary p-5 text-primary-foreground">
        <p className="text-[0.8125rem] font-bold tracking-[0.08em] uppercase">{props.badge ?? t.newestLesson}</p>
        <h2 className="font-heading text-3xl leading-tight font-bold" lang={e.school_lang}>
          {e.title}
        </h2>
        <p>{meta}</p>
        <button
          onClick={props.onOpen}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-background text-lg font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-foreground/40"
        >
          <PlayIcon className="size-5" aria-hidden /> {t.openLesson}
        </button>
        {props.onShare && props.onRemove && <PackActions onShare={props.onShare} onRemove={props.onRemove} onPrimary />}
      </li>
    )
  return (
    <li className="rounded-2xl border border-border bg-card">
      <button className="flex min-h-18 w-full items-center gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={props.onOpen}>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold" lang={e.school_lang}>
            {e.title}
          </span>
          <span className="block text-sm text-muted-foreground">{meta}</span>
          {props.badge && <span className="block text-sm text-primary">{props.badge}</span>}
        </span>
        <PlayIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {props.onShare && props.onRemove && (
        <div className="px-4 pb-4">
          <PackActions onShare={props.onShare} onRemove={props.onRemove} />
        </div>
      )}
    </li>
  )
}

function PackActions({ onShare, onRemove, onPrimary }: { onShare: () => void; onRemove: () => void; onPrimary?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex gap-2">
      <button
        onClick={onShare}
        className={cn(
          'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold outline-none focus-visible:ring-2',
          onPrimary ? 'bg-primary-foreground/10 focus-visible:ring-foreground/40' : 'bg-secondary focus-visible:ring-ring',
        )}
      >
        <Share2Icon className="size-4" aria-hidden /> {t.share}
      </button>
      <button
        onClick={onRemove}
        aria-label={t.remove}
        className={cn(
          'grid size-12 place-items-center rounded-xl outline-none focus-visible:ring-2',
          onPrimary ? 'bg-primary-foreground/10 focus-visible:ring-foreground/40' : 'text-few focus-visible:ring-ring',
        )}
      >
        <Trash2Icon className="size-5" aria-hidden />
      </button>
    </div>
  )
}

/** Lesson picker: imported packs (newest first) plus the built-in sample, and the "Add a lesson pack" button. */
export default function Library({ onOpen, pending }: { onOpen: (lesson: OpenLesson) => void; pending: number | null }) {
  const { t, lang, setLang } = useT()
  const [packs, setPacks] = useState<StoredPack[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [classroom, setClassroom] = useState<ClassroomRecord | null>(null)
  const [editingClassroom, setEditingClassroom] = useState(false)
  const [getting, setGetting] = useState(false)

  const refresh = useCallback(
    () =>
      listPacks().then(setPacks, (e) => {
        console.error('Could not list packs', e)
        setNotice({ kind: 'error', text: t.cantRead })
      }),
    [t],
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
      setNotice({ kind: 'ok', text: t.added(pack.episode.title) })
      await refresh()
    } catch (err) {
      if (!(err instanceof PackError)) console.error('Pack import failed', err)
      setNotice({ kind: 'error', text: err instanceof PackError ? err.message : t.cantAdd })
    } finally {
      setBusy(false)
    }
  }

  async function open(p: StoredPack) {
    const files = await loadPackFiles(p.id)
    const audio = Object.fromEntries(Object.entries(files?.audio ?? {}).map(([id, bytes]) => [id, URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg; codecs=opus' }))]))
    onOpen({ episode: p.episode, audio })
  }

  async function share(p: StoredPack) {
    const files = await loadPackFiles(p.id)
    if (!files) return setNotice({ kind: 'error', text: t.filesMissing })
    if ((await sharePack(p.id, p.episode.title, files.zip)) === 'saved') {
      setNotice({ kind: 'ok', text: t.savedToDownloads(`${p.id}.sahpaathi`) })
    }
  }

  async function remove(p: StoredPack) {
    if (!confirm(t.confirmRemove(p.episode.title))) return
    await deletePack(p.id)
    await refresh()
  }

  const [newest, ...rest] = packs

  return (
    <main className="theme-board min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <LogoMark className="size-6" />
            </span>
            <h1 className="font-heading text-2xl font-bold">Sahpaathi</h1>
          </div>
          <label className="sr-only" htmlFor="ui-lang">
            {t.language}
          </label>
          <select
            id="ui-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as UiLang)}
            className="h-11 rounded-xl border border-input bg-card px-2 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {UI_LANGS.map((l) => (
              <option key={l.lang} value={l.lang}>
                {l.name}
              </option>
            ))}
          </select>
        </header>

        <ModeSwitch current="offline" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-muted-foreground">{classroom ? t.classLine(classroom.classroom_id, classroom.rolls.length) : t.chooseLesson}</p>
          <SyncBadge pending={pending} />
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="-mr-3" onClick={() => setEditingClassroom((v) => !v)}>
            <PencilIcon aria-hidden /> {classroom ? t.changeClass : t.setUpClass}
          </Button>
        </div>

        {editingClassroom && (
          <section className="flex flex-col gap-3">
            <ClassroomSetup
              classroom={classroom}
              onSaved={(c) => {
                setClassroom(c)
                setEditingClassroom(false)
                setNotice({ kind: 'ok', text: t.classroomSet(c.classroom_id) })
              }}
            />
            <Button variant="ghost" size="lg" onClick={() => setEditingClassroom(false)}>
              {t.cancel}
            </Button>
          </section>
        )}

        {notice && (
          <p role="status" className={cn('rounded-2xl p-4 text-lg', notice.kind === 'ok' ? 'bg-ok text-ok-foreground' : 'bg-bad text-bad-foreground')}>
            {notice.text}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {newest ? (
            <LessonCard featured episode={newest.episode} onOpen={() => open(newest)} onShare={() => share(newest)} onRemove={() => remove(newest)} />
          ) : (
            <LessonCard featured badge={t.builtInSample} episode={samplePack.episode} onOpen={() => onOpen(samplePack)} />
          )}
          {rest.length > 0 && <li className="pt-2 text-[0.8125rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t.onThisPhone}</li>}
          {rest.map((p) => (
            <LessonCard key={p.id} episode={p.episode} onOpen={() => open(p)} onShare={() => share(p)} onRemove={() => remove(p)} />
          ))}
          {newest && <LessonCard episode={samplePack.episode} badge={t.builtInSample} onOpen={() => onOpen(samplePack)} />}
        </ul>

        {getting ? (
          <GetLessons
            have={new Set(packs.map((p) => p.id))}
            onImported={(p) => {
              setNotice({ kind: 'ok', text: t.added(p.episode.title) })
              refresh()
            }}
          />
        ) : (
          <Button size="lg" variant="outline" className="h-16 text-lg" onClick={() => setGetting(true)}>
            <CloudDownloadIcon className="size-5" aria-hidden /> {t.getNewLessons}
          </Button>
        )}

        <label
          className={cn(
            'flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input text-lg font-semibold focus-within:ring-2 focus-within:ring-ring',
            busy ? 'opacity-60' : 'cursor-pointer hover:border-primary',
          )}
        >
          <DownloadIcon className="size-5" aria-hidden /> {busy ? t.checkingPack : t.addFromFile}
          <input type="file" accept=".sahpaathi,application/zip" className="sr-only" disabled={busy} onChange={onFile} />
        </label>
      </div>
    </main>
  )
}
