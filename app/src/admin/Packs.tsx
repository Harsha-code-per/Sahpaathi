import { useCallback, useEffect, useState } from 'react'
import { adminApi, ApiError, downloadPack, type PackSummary, type Summary } from './api'
import { anyBuilding, formatSize, PACK_STATUS, packRows } from './view'

const POLL_MS = 5000
const card = 'rounded-2xl border border-border bg-card p-5'
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'
const quiet = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

export default function Packs({ onSignedOut }: { onSignedOut: () => void }) {
  const [episodes, setEpisodes] = useState<Summary[]>([])
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return onSignedOut()
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    },
    [onSignedOut],
  )

  const refresh = useCallback(
    () =>
      Promise.all([adminApi.episodes(), adminApi.packs()]).then(([e, p]) => {
        setEpisodes(e)
        setPacks(p)
        setLoaded(true)
        setError('')
      }, handle),
    [handle],
  )

  useEffect(() => void refresh(), [refresh])

  const building = anyBuilding(packs)
  useEffect(() => {
    if (!building) return
    const id = window.setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [building, refresh])

  async function build(episodeId: number) {
    setBusyId(episodeId)
    try {
      await adminApi.buildPack(episodeId)
      await refresh()
    } catch (err) {
      handle(err)
    } finally {
      setBusyId(null)
    }
  }

  async function download(pack: PackSummary) {
    setBusyId(pack.episode_id)
    try {
      await downloadPack(pack)
    } catch (err) {
      handle(err)
    } finally {
      setBusyId(null)
    }
  }

  const rows = packRows(episodes, packs)
  return (
    <section className={`${card} space-y-3`} aria-labelledby="packs">
      <h2 id="packs" className="font-semibold">Packs for approved episodes</h2>
      <p className="text-sm text-muted-foreground">
        A pack is the episode with its voices, signed so the app can check it. Building takes a few minutes and uses text-to-speech credits, so build once per approved episode.
      </p>
      {error && <p role="alert" className="text-bad-foreground">{error}</p>}
      {!loaded ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No approved episodes yet. Approve one in the Studio first.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ episode, latest, ready }) => (
            <li key={episode.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{episode.title ?? `${episode.lesson_id}, ${episode.district_id}`}</p>
                <p className="text-sm text-muted-foreground">
                  {episode.district_id}
                  {ready && `, pack ${formatSize(ready.size_bytes)}`}
                </p>
                {latest?.status === 'failed' && <p className="mt-1 text-sm text-bad-foreground">{latest.error}</p>}
              </div>
              <div className="flex items-center gap-2">
                {latest && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PACK_STATUS[latest.status].tone}`}>
                    {PACK_STATUS[latest.status].label}
                  </span>
                )}
                {ready && (
                  <button className={quiet} disabled={busyId === episode.id} onClick={() => download(ready)}>
                    Download
                  </button>
                )}
                <button
                  className={button}
                  disabled={busyId === episode.id || latest?.status === 'building'}
                  onClick={() => build(episode.id)}
                >
                  {latest?.status === 'building' ? 'Building…' : ready ? 'Build again' : 'Build pack'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
