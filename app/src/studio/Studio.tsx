import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { api, ApiError, session, type Catalog, type Summary } from './api'
import EpisodeView from './EpisodeView'
import { LANG_NAMES, STATUS } from './view'
import type { Lang } from '../lib/types'

const POLL_MS = 5000

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-ink focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30'
const primary = 'rounded-lg bg-ink px-4 py-2 font-semibold text-white hover:bg-ink/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sun focus-visible:outline-none'

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login(email, password)
      if (res.role === 'teacher') throw new ApiError('Teacher accounts use the lesson player, not the Studio.', 403)
      session.set(res.token)
      onIn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-ink">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Sahpaathi Studio</h1>
          <p className="mt-1 text-slate-600">Review the lessons Claude writes before they reach a classroom.</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input className={field} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-clay">{error}</p>}
        <button className={`${primary} w-full`} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  )
}

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
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Write a new episode</h2>
      <label className="block">
        <span className="text-sm text-slate-600">Lesson</span>
        <select className={field} value={lesson} onChange={(e) => setLesson(e.target.value)}>
          {catalog.lessons.map((l) => (
            <option key={l.id} value={l.id}>
              Grade {l.grade}: {l.chapter}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">District and languages</span>
        <select className={field} value={district} onChange={(e) => setDistrict(e.target.value)}>
          {catalog.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}: {d.home_lang === d.school_lang ? LANG_NAMES[d.home_lang as Lang] : `${LANG_NAMES[d.home_lang as Lang]} to ${LANG_NAMES[d.school_lang as Lang]}`}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <button className={`${primary} w-full`} disabled={busy || !lesson || !district}>
        {busy ? 'Starting…' : 'Write episode'}
      </button>
      <p className="text-sm text-slate-500">Claude writes it, then a second model reviews it. This takes about five minutes.</p>
    </form>
  )
}

function EpisodeList({ items, selected, onSelect }: { items: Summary[]; selected: number | null; onSelect: (id: number) => void }) {
  if (!items.length) return <p className="px-1 text-slate-500">No episodes yet. Write the first one above.</p>
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id}>
          <button
            onClick={() => onSelect(e.id)}
            aria-current={e.id === selected}
            className={`w-full rounded-xl p-3 text-left focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none bg-white ${e.id === selected ? 'ring-2 ring-ink' : 'hover:bg-slate-50'}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{e.title ?? `${e.lesson_id}, ${e.district_id}`}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              {e.district_id} {new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </button>
        </li>
      ))}
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

  const writing = items.some((e) => e.status === 'generating')
  useEffect(() => {
    if (!writing) return
    const id = window.setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [writing, refresh])

  if (!signedIn) return <Login onIn={() => setSignedIn(true)} />

  const current = items.find((e) => e.id === selected)
  return (
    <div className="min-h-screen bg-slate-100 text-ink">
      <header className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <h1 className="text-lg font-bold">
          Sahpaathi <span className="font-normal text-sun">Studio</span>
        </h1>
        <button onClick={logout} className="rounded-lg px-3 py-1 text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sun focus-visible:outline-none">
          Log out
        </button>
      </header>
      {error && <p role="alert" className="bg-clay/10 px-4 py-2 text-clay">{error}</p>}
      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[22rem_1fr]">
        <aside className={`space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto ${selected !== null ? 'hidden lg:block' : ''}`}>
          {catalog && <NewEpisode catalog={catalog} onStarted={(s) => (setItems((l) => [s, ...l]), setSelected(s.id))} />}
          <EpisodeList items={items} selected={selected} onSelect={setSelected} />
        </aside>
        <main className={selected === null ? 'hidden lg:block' : ''}>
          {selected === null ? (
            <p className="rounded-2xl bg-white p-6 text-slate-500 shadow-sm">Pick an episode to read it line by line, with the English translation and the AI review beside it.</p>
          ) : (
            <EpisodeView
              key={selected}
              id={selected}
              status={current?.status}
              onBack={() => setSelected(null)}
              onChanged={refresh}
              onError={handle}
            />
          )}
        </main>
      </div>
    </div>
  )
}
