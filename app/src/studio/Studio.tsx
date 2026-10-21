import { CheckCircle2Icon, ClipboardListIcon, LogOutIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { cn } from 'cn'
import { AppShell, type SidebarApi } from '@/components/AppShell'
import { LoginCard } from '@/components/LoginCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, ApiError, session, type Catalog, type Status, type Summary } from './api'
import EpisodeView from './EpisodeView'
import { LANG_NAMES, STATUS } from './view'
import type { Lang } from '../lib/types'

const POLL_MS = 5000

const field =
  'h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

function NewEpisode({ catalog, onStarted }: { catalog: Catalog; onStarted: (s: Summary) => void }) {
  const [lesson, setLesson] = useState(catalog.lessons[0]?.id ?? '')
  const [district, setDistrict] = useState(catalog.districts[0]?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onStarted(await api.generate(lesson, district))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start writing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">Lesson</span>
        <select className={field} value={lesson} onChange={(e) => setLesson(e.target.value)}>
          {catalog.lessons.map((l) => (
            <option key={l.id} value={l.id}>
              Grade {l.grade}: {l.chapter}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">District and languages</span>
        <select className={field} value={district} onChange={(e) => setDistrict(e.target.value)}>
          {catalog.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}: {d.home_lang === d.school_lang ? LANG_NAMES[d.home_lang as Lang] : `${LANG_NAMES[d.home_lang as Lang]} to ${LANG_NAMES[d.school_lang as Lang]}`}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-bad px-3 py-2 text-sm text-bad-foreground">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || !lesson || !district}>
        {busy ? 'Starting…' : 'Write lesson'}
      </Button>
    </form>
  )
}

type Filter = 'review' | 'approved' | 'all'
const FILTERS: { key: Filter; label: string; match: (s: Status) => boolean }[] = [
  { key: 'review', label: 'To review', match: (s) => s === 'in_review' || s === 'generating' || s === 'failed' },
  { key: 'approved', label: 'Approved', match: (s) => s === 'approved' },
  { key: 'all', label: 'All', match: () => true },
]

function EpisodeList(props: { items: Summary[]; selected: number | null; onSelect: (id: number) => void; onDark?: boolean }) {
  if (!props.items.length) return <p className={cn('px-1 text-sm', props.onDark ? 'text-sidebar-muted' : 'text-muted-foreground')}>No lessons here.</p>
  return (
    <ul className="space-y-1">
      {props.items.map((e) => {
        const on = e.id === props.selected
        return (
          <li key={e.id}>
            <button
              onClick={() => props.onSelect(e.id)}
              aria-current={on}
              className={cn(
                'w-full rounded-xl px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                props.onDark ? 'hover:bg-sidebar-accent' : 'border border-border bg-card hover:bg-muted',
                on && (props.onDark ? 'bg-sidebar-accent' : 'ring-2 ring-ring'),
              )}
            >
              <span className="line-clamp-2 font-semibold">{e.title ?? `${e.lesson_id}, ${e.district_id}`}</span>
              <span className={cn('mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]', props.onDark ? 'text-sidebar-muted' : 'text-muted-foreground')}>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
                {e.district_id} · {new Date(e.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function Studio() {
  const [signedIn, setSignedIn] = useState(() => session.get() !== null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [items, setItems] = useState<Summary[]>([])
  // The open episode lives in the URL (?episode=12), so a reload or a shared link lands on it.
  const [selected, setSelectedState] = useState<number | null>(() => Number(new URLSearchParams(location.search).get('episode')) || null)
  const setSelected = useCallback((id: number | null) => {
    setSelectedState(id)
    history.replaceState(null, '', id === null ? location.pathname : `?episode=${id}`)
  }, [])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('review')
  const [query, setQuery] = useState('')
  const [writingOpen, setWritingOpen] = useState(false)

  const logout = useCallback(() => {
    session.clear()
    setSignedIn(false)
  }, [])

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return logout()
      setError(err instanceof ApiError ? err.message : 'Something went wrong loading the Studio.')
    },
    [logout],
  )

  const refresh = useCallback(() => api.episodes().then((list) => (setItems(list), setError('')), handle), [handle])

  useEffect(() => {
    if (!signedIn) return
    api.catalog().then(setCatalog, handle)
    refresh()
  }, [signedIn, refresh, handle])

  // Open on the tab that has something in it: with nothing to review, show the approved lessons.
  const [picked, setPicked] = useState(false)
  if (!picked && items.length) {
    setPicked(true)
    if (!items.some((e) => FILTERS[0].match(e.status))) setFilter('approved')
  }

  const writing = items.some((e) => e.status === 'generating')
  useEffect(() => {
    if (!writing) return
    const id = window.setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [writing, refresh])

  if (!signedIn)
    return (
      <LoginCard
        product="Studio"
        demo={[
          { role: 'Reviewer', email: 'reviewer@sahpaathi.test' },
          { role: 'Admin', email: 'admin@sahpaathi.test' },
        ]}
        blurb="Review the lessons Claude writes before they reach a classroom."
        login={async (email, password) => {
          const res = await api.login(email, password)
          if (res.role === 'teacher') throw new ApiError('Teacher accounts use the lesson player, not the Studio.', 403)
          session.set(res.token)
          setSignedIn(true)
        }}
      />
    )

  const current = items.find((e) => e.id === selected)
  const q = query.trim().toLowerCase()
  const shown = items.filter(
    (e) => FILTERS.find((f) => f.key === filter)!.match(e.status) && (!q || [e.title, e.lesson_id, e.district_id].some((t) => t?.toLowerCase().includes(q))),
  )
  const count = (f: Filter) => items.filter((e) => FILTERS.find((x) => x.key === f)!.match(e.status)).length

  const sidebar = ({ collapsed, expand, close }: SidebarApi) =>
    collapsed ? (
      <div className="flex flex-col items-center gap-2">
        <Button size="icon" aria-label="Write a new lesson" title="Write a new lesson" onClick={() => setWritingOpen(true)}>
          <PlusIcon aria-hidden />
        </Button>
        {(
          [
            ['review', ClipboardListIcon],
            ['approved', CheckCircle2Icon],
          ] as const
        ).map(([f, Icon]) => {
          const label = `${FILTERS.find((x) => x.key === f)!.label}: ${count(f)}`
          return (
            <button
              key={f}
              aria-label={label}
              title={label}
              onClick={() => (setFilter(f), expand())}
              className="relative grid size-11 place-items-center rounded-xl text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Icon className="size-5" aria-hidden />
              <span className="absolute -top-0.5 -right-0.5 rounded-full bg-sidebar-primary px-1.5 text-[0.6875rem] font-bold text-sidebar-primary-foreground">{count(f)}</span>
            </button>
          )
        })}
      </div>
    ) : (
      <>
        <Button onClick={() => (setWritingOpen(true), close())}>
          <PlusIcon aria-hidden /> Write a new lesson
        </Button>
        <div role="group" aria-label="Show" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                filter === f.key ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-muted hover:text-sidebar-foreground',
              )}
            >
              {f.label} {f.key !== 'all' && count(f.key)}
            </button>
          ))}
        </div>
        <EpisodeList items={shown} selected={selected} onSelect={(id) => (setSelected(id), close())} onDark />
      </>
    )

  const topbar = (
    <>
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 md:max-w-sm">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input className="w-full bg-transparent outline-none" placeholder="Search lessons" aria-label="Search lessons" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="flex-1 max-md:hidden" />
      <Button variant="ghost" onClick={logout}>
        <LogOutIcon aria-hidden /> <span className="max-sm:sr-only">Log out</span>
      </Button>
    </>
  )

  return (
    <AppShell product="Studio" sidebar={sidebar} topbar={topbar}>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-bad px-4 py-3 text-bad-foreground">
          {error}
        </p>
      )}
      {selected === null ? (
        <>
          <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-[0_1px_2px_rgba(23,37,36,0.04),0_14px_34px_-14px_rgba(23,37,36,0.14)] max-md:hidden">
            <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 grid size-56 place-items-center">
              <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e]" />
              <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e] [animation-delay:-1.4s]" />
              <span className="size-10 rounded-full bg-[#f4b23e]/70" />
            </span>
            <h1 className="max-w-xl font-heading text-3xl leading-tight font-bold">Pick a lesson to read it line by line.</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">Each line sits beside its English back-translation and the AI review. Correct what is wrong, then approve or reject.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => setWritingOpen(true)}>
                <PlusIcon aria-hidden /> Write a new lesson
              </Button>
              {shown[0] && (
                <Button variant="outline" onClick={() => setSelected(shown[0].id)}>
                  Open {shown[0].title ?? 'the first lesson'}
                </Button>
              )}
            </div>
          </section>
          {/* Phones have no sidebar: the list is the first screen. */}
          <div className="md:hidden">
            <EpisodeList items={shown} selected={selected} onSelect={setSelected} />
          </div>
        </>
      ) : (
        <EpisodeView
          key={selected}
          id={selected}
          status={current?.status}
          onBack={() => setSelected(null)}
          onChanged={refresh}
          onError={handle}
          onOpen={(next) => (void refresh(), setSelected(next))}
        />
      )}

      <Dialog open={writingOpen} onOpenChange={setWritingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Write a new lesson</DialogTitle>
            <DialogDescription>Claude writes it, then a second model reviews it. This takes about five minutes.</DialogDescription>
          </DialogHeader>
          {catalog ? (
            <NewEpisode catalog={catalog} onStarted={(s) => (setItems((l) => [s, ...l]), setSelected(s.id), setFilter('review'), setWritingOpen(false))} />
          ) : (
            <p className="text-muted-foreground">Loading lessons…</p>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
