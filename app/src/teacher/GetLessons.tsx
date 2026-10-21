import { CheckIcon, CloudDownloadIcon, LogOutIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '../studio/api'
import { downloadPack, listRemotePacks, signIn, teacherToken, type RemotePack } from '../packs/remote'
import { importPack } from '../packs/store'
import { PackError } from '../packs/verify'
import type { StoredPack } from '../storage/db'
import { useT } from './i18n'

const field =
  'min-h-14 w-full rounded-xl border border-input bg-background px-4 text-lg text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

const kb = (b: number | null) => (b === null ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

/** Online only: sign in once, see the ready lessons, download one into the phone. */
export default function GetLessons({ have, onImported }: { have: Set<string>; onImported: (p: StoredPack) => void }) {
  const { t } = useT()
  const [token, setToken] = useState(teacherToken.get)
  const [packs, setPacks] = useState<RemotePack[] | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<Record<number, number>>({})

  const signOut = useCallback(() => {
    teacherToken.clear()
    setToken(null)
    setPacks(null)
  }, [])

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        signOut()
        return setError(t.signInAgain)
      }
      setError(err instanceof ApiError || err instanceof PackError ? err.message : t.somethingWrong)
    },
    [signOut, t],
  )

  useEffect(() => {
    if (!token) return
    listRemotePacks(token).then((p) => (setPacks(p), setError('')), fail)
  }, [token, fail])

  async function login(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError('')
    try {
      await signIn(String(form.get('email')), String(form.get('password')))
      setToken(teacherToken.get())
    } catch (err) {
      fail(err)
    }
  }

  async function get(p: RemotePack) {
    if (!token) return
    setError('')
    setProgress((s) => ({ ...s, [p.id]: 0 }))
    try {
      const blob = await downloadPack(p.id, token, (f) => setProgress((s) => ({ ...s, [p.id]: f })))
      onImported(await importPack(blob)) // checks the signature before anything is saved
    } catch (err) {
      fail(err)
    } finally {
      setProgress((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== p.id)))
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" aria-labelledby="get-lessons">
      <div className="flex items-center justify-between gap-3">
        <h2 id="get-lessons" className="font-heading text-xl font-bold">
          {t.newLessons}
        </h2>
        {token && (
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOutIcon aria-hidden /> {t.signOut}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-bad p-4 text-lg text-bad-foreground">
          {error}
        </p>
      )}

      {!token ? (
        <form onSubmit={login} className="flex flex-col gap-3">
          <p className="text-muted-foreground">{t.signInHelp}</p>
          <label className="flex flex-col gap-2 text-lg">
            <span className="text-muted-foreground">{t.email}</span>
            <input name="email" type="email" autoComplete="username" required className={field} />
          </label>
          <label className="flex flex-col gap-2 text-lg">
            <span className="text-muted-foreground">{t.password}</span>
            <input name="password" type="password" autoComplete="current-password" required className={field} />
          </label>
          <Button size="lg" type="submit">
            {t.signIn}
          </Button>
        </form>
      ) : packs === null ? (
        <p className="text-muted-foreground">{t.looking}</p>
      ) : packs.length === 0 ? (
        <p className="text-muted-foreground">{t.noneYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {packs.map((p) => {
            const onPhone = p.episode_slug !== null && have.has(p.episode_slug)
            const pct = progress[p.id]
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.title ?? p.episode_slug}</p>
                  <p className="text-sm text-muted-foreground">{t.packMeta(p.grade, p.district_id, kb(p.size_bytes))}</p>
                  {pct !== undefined && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-label={t.get}>
                      <div className="h-full bg-primary transition-[width]" style={{ width: `${pct * 100}%` }} />
                    </div>
                  )}
                </div>
                {onPhone ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-most">
                    <CheckIcon className="size-4" aria-hidden /> {t.onPhone}
                  </span>
                ) : (
                  <Button size="sm" disabled={pct !== undefined} onClick={() => get(p)} aria-label={t.download(p.title ?? p.episode_slug ?? '')}>
                    <CloudDownloadIcon aria-hidden /> {pct !== undefined ? `${Math.round(pct * 100)}%` : t.get}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
