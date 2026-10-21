import { lazy, type ComponentType } from 'react'

export { cn } from "cn"

/** A v4 UUID. crypto.randomUUID is missing on older Android WebViews (before Chrome 92), which classroom phones still run. */
export const uuid = (): string =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16))

/**
 * After a deploy, an open tab (or the service worker's cached page) still asks for the old code files, which no
 * longer exist. Reload once to pick up the new version instead of crashing; returns false if it just did that.
 */
export function reloadOnce(): boolean {
  const last = Number(sessionStorage.getItem('sahpaathi.reloaded') ?? 0)
  if (Date.now() - last < 30_000) return false
  sessionStorage.setItem('sahpaathi.reloaded', String(Date.now()))
  const reload = () => location.reload()
  if (!navigator.serviceWorker) reload()
  else navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}).finally(reload)
  return true
}

/** React.lazy that reloads the page once when the code file is gone (see reloadOnce), instead of crashing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy itself
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy<T>(() => load().catch((err: unknown) => (reloadOnce() ? new Promise<never>(() => {}) : Promise.reject(err))))
}
