import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDB, type RecordingRecord } from '../storage/db'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs'
import { deleteRecording, listRecordings, newId, refreshReviews, saveRecording, startRecorder } from './recordings'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => vi.unstubAllGlobals())

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('startRecorder', () => {
  function fakeMic() {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    class FakeRecorder {
      static isTypeSupported = (m: string) => m === 'audio/webm;codecs=opus'
      mimeType = 'audio/webm;codecs=opus'
      state = 'recording'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {}
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['abc']) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const closed = vi.fn(async () => {})
    class FakeAudioContext {
      createAnalyser() {
        return { fftSize: 0, getByteTimeDomainData: (b: Uint8Array) => b.fill(160) }
      }
      createMediaStreamSource() {
        return { connect: () => {} }
      }
      close = closed
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    return { track, closed }
  }

  it('is null when the microphone is refused', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => Promise.reject(new Error('denied')) } })
    expect(await startRecorder()).toBeNull()
  })

  it('records, reports a level, and releases the microphone on stop', async () => {
    const { track, closed } = fakeMic()
    const rec = (await startRecorder())!
    expect(rec.level()).toBe(0.5) // a steady 160 is 32 off the centre, half of the 64 that counts as full
    const take = await rec.stop()
    expect(take.blob.size).toBe(3)
    expect(take.mime).toBe('audio/webm;codecs=opus')
    expect(take.seconds).toBeGreaterThanOrEqual(0)
    expect(track.stop).toHaveBeenCalled()
    expect(closed).toHaveBeenCalled()
  })

  it('cancel releases the microphone without a take', async () => {
    const { track } = fakeMic()
    const rec = (await startRecorder())!
    rec.cancel()
    expect(track.stop).toHaveBeenCalled()
  })
})

describe('recordings store', () => {
  const rec = (id: string): RecordingRecord => ({
    id,
    episode_id: 'e',
    subject: 'numeracy',
    grade: 1,
    lang: 'en',
    duration_sec: 5,
    mime: 'audio/webm',
    audio: new Blob(['x']),
    at: '2026-10-01T00:00:00Z',
    status: 'saved',
  })

  it('makes a fresh id each time', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('a').mockReturnValueOnce('b') })
    expect([newId(), newId()]).toEqual(['a', 'b'])
  })

  it('deletes a recording', async () => {
    await saveRecording(rec('one-rec-0001'))
    await deleteRecording('one-rec-0001')
    expect(await listRecordings()).toEqual([])
  })

  it('does not call the server when nothing is waiting for a review', async () => {
    await saveRecording(rec('one-rec-0001'))
    const fetchFn = vi.fn()
    expect(await refreshReviews('tok', fetchFn as never)).toHaveLength(1)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('turns a server error into a readable message', async () => {
    await saveRecording({ ...rec('one-rec-0001'), status: 'sent' })
    const bad = () => Promise.resolve(new Response(JSON.stringify({ detail: 'Please log in again.' }), { status: 401 }))
    await expect(refreshReviews('tok', bad)).rejects.toThrow('Please log in again.')
    const noJson = () => Promise.resolve(new Response('oops', { status: 500 }))
    await expect(refreshReviews('tok', noJson)).rejects.toThrow('The server answered 500.')
  })
})

describe('prefs on the phone', () => {
  it('saves and loads', () => {
    vi.stubGlobal('localStorage', memory())
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    savePrefs({ ...DEFAULT_PREFS, rate: 0.8, boost: 2 })
    expect(loadPrefs()).toMatchObject({ rate: 0.8, boost: 2 })
  })

  it('carries on when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    vi.stubGlobal('localStorage', blocked)
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow()
  })
})
