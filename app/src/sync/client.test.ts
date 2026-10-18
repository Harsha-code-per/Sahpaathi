import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SYNC_BATCH, flushOutbox } from './client'
import { closeDB, type OutboxEvent } from '../storage/db'
import { pendingCount, recordTap } from './outbox'

const API = 'https://api.example.test/'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

async function queue(n: number) {
  for (let i = 0; i < n; i++) {
    await recordTap({ episode_id: 'ep1', segment_id: `s${i}`, tap: 'some', auto: false }, new Date(Date.UTC(2026, 9, 19, 4, 0, i)))
  }
}

const ok = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
const sentEvents = (f: ReturnType<typeof ok>, call = 0) =>
  (JSON.parse(f.mock.calls[call][1]!.body as string) as { events: OutboxEvent[] }).events

describe('flushOutbox', () => {
  it('posts queued events to /api/v1/sync and clears them', async () => {
    await queue(3)
    const f = ok()
    expect(await flushOutbox(API, f)).toEqual({ sent: 3, pending: 0 })
    expect(f).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/v1/sync')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(sentEvents(f).map((e) => e.segment_id)).toEqual(['s0', 's1', 's2'])
    expect(await pendingCount()).toBe(0)
  })

  it('does nothing when the queue is empty', async () => {
    const f = ok()
    expect(await flushOutbox(API, f)).toEqual({ sent: 0, pending: 0 })
    expect(f).not.toHaveBeenCalled()
  })

  it('keeps events when no API URL is configured', async () => {
    await queue(2)
    const f = ok()
    expect(await flushOutbox(undefined, f)).toMatchObject({ sent: 0, pending: 2, error: 'no API URL configured' })
    expect(f).not.toHaveBeenCalled()
  })

  it('keeps events when offline', async () => {
    await queue(2)
    const f = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await flushOutbox(API, f)).toMatchObject({ sent: 0, pending: 2, error: 'offline' })
  })

  it('keeps events when the server rejects them', async () => {
    await queue(2)
    const f = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
    expect(await flushOutbox(API, f)).toMatchObject({ sent: 0, pending: 2, error: 'HTTP 503' })
  })

  it('sends in batches and stops at the first failed batch', async () => {
    await queue(SYNC_BATCH + 5)
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await flushOutbox(API, f)).toMatchObject({ sent: SYNC_BATCH, pending: 5, error: 'offline' })
    expect(sentEvents(f, 0)).toHaveLength(SYNC_BATCH)
    expect(sentEvents(f, 1).map((e) => e.segment_id)).toEqual(['s100', 's101', 's102', 's103', 's104'])
  })

  it('shares one run between concurrent calls', async () => {
    await queue(2)
    const f = ok()
    const [a, b] = await Promise.all([flushOutbox(API, f), flushOutbox(API, f)])
    expect(a).toBe(b)
    expect(f).toHaveBeenCalledOnce()
  })

  it('also sends events queued while a request is in flight', async () => {
    await queue(1)
    const f = vi.fn<typeof fetch>(async () => {
      if (f.mock.calls.length === 1) await recordTap({ episode_id: 'ep1', segment_id: 'late', tap: 'few', auto: true })
      return new Response(null, { status: 200 })
    })
    expect(await flushOutbox(API, f)).toEqual({ sent: 2, pending: 0 })
    expect(sentEvents(f, 1).map((e) => e.segment_id)).toEqual(['late'])
  })
})
