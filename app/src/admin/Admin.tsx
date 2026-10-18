import { useState, type SubmitEvent } from 'react'
import { adminApi, ApiError, session } from './api'
import Dashboard from './Dashboard'
import Packs from './Packs'

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
      const res = await adminApi.login(email, password)
      if (res.role !== 'admin') throw new ApiError('The admin pages need an admin account.', 403)
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
          <h1 className="text-2xl font-bold">Sahpaathi Admin</h1>
          <p className="mt-1 text-slate-600">How classrooms are using the lessons, and the packs that go to them.</p>
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

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packs', label: 'Packs' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function Admin() {
  const [signedIn, setSignedIn] = useState(() => session.get() !== null)
  const [tab, setTab] = useState<Tab>('dashboard')

  const logout = () => {
    session.clear()
    setSignedIn(false)
  }

  if (!signedIn) return <Login onIn={() => setSignedIn(true)} />

  return (
    <div className="min-h-screen bg-slate-100 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-ink px-4 py-3 text-white">
        <h1 className="text-lg font-bold">
          Sahpaathi <span className="font-normal text-sun">Admin</span>
        </h1>
        <nav className="flex gap-1" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`rounded-lg px-3 py-1 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-sun focus-visible:outline-none ${tab === t.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="rounded-lg px-3 py-1 text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sun focus-visible:outline-none">
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {tab === 'dashboard' ? <Dashboard onSignedOut={logout} /> : <Packs onSignedOut={logout} />}
      </main>
    </div>
  )
}
