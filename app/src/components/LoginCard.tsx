import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useEffect, useState, type SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, BASE } from '@/studio/api'
import { LogoMark } from './Logo'
import './login.css'

const field =
  'h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

/**
 * The demo password for the test accounts. The server hands it out (GET /auth/demo) only when it has
 * DEMO_PASSWORD set, i.e. when it has seeded those accounts, so it is never in git or in this bundle.
 * VITE_DEMO_PASSWORD still works as an override. Neither: the card says to ask the team.
 */
const BUILD_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined

function useDemoPassword(enabled: boolean) {
  const [served, setServed] = useState<string | undefined>()
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch(`${BASE}/auth/demo`)
      .then((r) => (r.ok ? (r.json() as Promise<{ password: string }>) : null))
      .then((j) => live && j && setServed(j.password))
      .catch(() => undefined) // a server without demo accounts, or asleep: fall back below
    return () => {
      live = false
    }
  }, [enabled])
  return BUILD_PASSWORD || served
}

export type DemoAccount = { role: string; email: string }

/** Sign-in for the desk tools. `login` throws an ApiError whose message is shown as is. `demo` lists test accounts that one tap fills in. */
export function LoginCard(props: { product: string; blurb: string; demo?: DemoAccount[]; login: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const demoPassword = useDemoPassword(Boolean(props.demo))

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await props.login(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.')
      setBusy(false)
    }
  }

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-background p-4">
      <div aria-hidden className="login-bg absolute inset-0 -z-10">
        {[1, 3].map((n) => (
          <img key={n} src={`/media/landing-${n}.jpg`} alt="" decoding="async" />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(248,246,239,0.92),rgba(248,246,239,0.55)_55%,rgba(248,246,239,0.25))]" />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card/95 p-7 shadow-[0_20px_50px_rgba(23,37,36,0.1)]">
        <div className="space-y-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LogoMark className="size-7" />
          </span>
          <h1 className="font-heading text-2xl font-bold">Sahpaathi {props.product}</h1>
          <p className="text-muted-foreground">{props.blurb}</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Email</span>
          <input className={field} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Password</span>
          <span className="relative block">
            <input className={`${field} pr-12`} type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow(!show)}
              className="absolute top-0 right-0 grid size-11 place-items-center rounded-xl text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {show ? <EyeOffIcon className="size-5" aria-hidden /> : <EyeIcon className="size-5" aria-hidden />}
            </button>
          </span>
        </label>
        {props.demo && (
          <div className="space-y-2 rounded-2xl bg-secondary p-3">
            <p className="text-sm font-semibold">Demo accounts for evaluators</p>
            {props.demo.map((d) => (
              <div key={d.email} className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{d.role}</p>
                  <p className="truncate text-muted-foreground">{d.email}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEmail(d.email)
                    setPassword(demoPassword ?? '')
                    setError('')
                  }}
                >
                  Fill in
                </Button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              Password: {demoPassword ? <code className="rounded bg-card px-1.5 py-0.5 font-semibold text-foreground">{demoPassword}</code> : 'ask the team'}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-bad px-3 py-2 text-bad-foreground">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  )
}
