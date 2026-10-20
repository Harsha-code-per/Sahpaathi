import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/studio/api'
import { LogoMark } from './Logo'

const field =
  'h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

/** Sign-in for the desk tools. `login` throws an ApiError whose message is shown as is. */
export function LoginCard(props: { product: string; blurb: string; login: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

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
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-7 shadow-[0_20px_50px_rgba(23,37,36,0.1)]">
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
