import { beforeEach, describe, expect, it, vi } from 'vitest'

// Node has no browser storage or window: give the client just enough of both.
const store = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('window', new EventTarget())

const { call, session, SIGNED_OUT, ApiError } = await import('./api')

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => store.clear())

describe('call', () => {
  it('returns the JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ok: 1 })))
    await expect(call('/x')).resolves.toEqual({ ok: 1 })
  })

  it('signs out everywhere when the server rejects the token', async () => {
    session.set('a.b.c')
    const heard = vi.fn()
    window.addEventListener(SIGNED_OUT, heard)
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { detail: 'Please log in again.' })))
    await expect(call('/x')).rejects.toMatchObject({ status: 401, message: 'Please log in again.' })
    expect(session.get()).toBeNull()
    expect(heard).toHaveBeenCalledOnce()
  })

  it('explains an HTML answer (missing API URL) instead of failing to parse it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(call('/x')).rejects.toBeInstanceOf(ApiError)
  })

  it('gives a clear message when the server is too slow', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('slow', 'TimeoutError'))))
    await expect(call('/x')).rejects.toThrow(/took too long/)
  })
})

describe('session.role', () => {
  it('reads the role from the token and survives garbage', () => {
    session.set(`h.${btoa(JSON.stringify({ role: 'admin' }))}.s`)
    expect(session.role()).toBe('admin')
    session.set('not-a-token')
    expect(session.role()).toBeNull()
  })
})
