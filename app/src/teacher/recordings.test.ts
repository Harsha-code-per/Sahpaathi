import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDB, type RecordingRecord } from '../storage/db'
import { latestByTopic, listRecordings, refreshReviews, saveRecording, sendPending, sendRecording } from './recordings'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

const rec = (id: string, at: string, over: Partial<RecordingRecord> = {}): RecordingRecord => ({
  id,
  episode_id: 'g1-shapes-ta-en',
  subject: 'numeracy',
  grade: 1,
  lang: 'ta',
  duration_sec: 41.6,
  mime: 'audio/webm;codecs=opus',
  audio: new Blob(['x']),
  at,
  status: 'saved',
  ...over,
})

const ok = (body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe('recordings', () => {
  it('keeps the newest recording per topic', () => {
    const m = latestByTopic([rec('a', '2026-10-01'), rec('b', '2026-10-03'), rec('c', '2026-10-02', { episode_id: 'other' })])
    expect(m.get('g1-shapes-ta-en')?.id).toBe('b')
    expect(m.get('other')?.id).toBe('c')
  })

  it('sends the audio with its details, then marks it sent', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    await saveRecording(rec('3f2b1c9e-1111', '2026-10-01', { classroom_id: 'G1-A' }))
    const sent = await sendRecording((await listRecordings())[0], 'tok', (url, init) => ((seen = { url: String(url), init: init! }), ok()))
    expect(sent.status).toBe('sent')
    expect(seen!.url).toContain('/recordings/3f2b1c9e-1111?episode_id=g1-shapes-ta-en&subject=numeracy&grade=1&duration_sec=42&lang=ta&classroom_id=G1-A')
    expect(seen!.init).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer tok', 'Content-Type': 'audio/webm;codecs=opus' } })
    expect((await listRecordings())[0].status).toBe('sent')
  })

  it('refuses to send without a login, and leaves the recording on the phone', async () => {
    await saveRecording(rec('a-rec-0001', '2026-10-01'))
    await expect(sendRecording((await listRecordings())[0], null)).rejects.toThrow(/Sign in/)
    expect((await listRecordings())[0].status).toBe('saved')
  })

  it('a send that fails for lack of signal keeps it saved and stops the queue quietly', async () => {
    await saveRecording(rec('a-rec-0001', '2026-10-01'))
    await saveRecording(rec('b-rec-0002', '2026-10-02'))
    let calls = 0
    await sendPending('tok', () => (calls++, Promise.reject(new TypeError('offline'))))
    expect(calls).toBe(1)
    expect((await listRecordings()).map((r) => r.status)).toEqual(['saved', 'saved'])
  })

  it("pulls a finished review into the local record, and leaves ones still being reviewed", async () => {
    await saveRecording(rec('a-rec-0001', '2026-10-01', { status: 'sent' }))
    await saveRecording(rec('b-rec-0002', '2026-10-02', { status: 'sent' }))
    const review = { clarity: 5, accuracy: 4, pace: 4, child_friendly: 5, safe: true, summary: 'Clear.', tips: [] }
    const out = await refreshReviews('tok', () =>
      ok([
        { id: 'a-rec-0001', status: 'reviewed', transcript: 'hello', review },
        { id: 'b-rec-0002', status: 'received', transcript: null, review: null },
      ]),
    )
    const by = Object.fromEntries(out.map((r) => [r.id, r]))
    expect(by['a-rec-0001']).toMatchObject({ status: 'reviewed', transcript: 'hello', review })
    expect(by['b-rec-0002'].status).toBe('sent')
  })
})
