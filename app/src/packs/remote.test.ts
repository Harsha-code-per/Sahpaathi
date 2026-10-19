import { expect, test, vi } from 'vitest'
import { downloadPack } from './remote'

const BYTES = new Uint8Array(Array.from({ length: 10 }, (_, i) => i))

/** A body that delivers `chunk` and then, if `breakAfter`, fails like a dropped 2G connection. */
function body(chunk: Uint8Array, breakAfter: boolean) {
  let sent = false
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (!sent) {
        sent = true
        return c.enqueue(chunk)
      }
      if (breakAfter) c.error(new TypeError('network'))
      else c.close()
    },
  })
}

test('a download that drops mid-way resumes from the byte it reached', async () => {
  const fetchFn = vi.fn<typeof fetch>()
  fetchFn.mockResolvedValueOnce(new Response(body(BYTES.slice(0, 4), true), { status: 200, headers: { 'Content-Length': '10' } }))
  fetchFn.mockResolvedValueOnce(new Response(body(BYTES.slice(4), false), { status: 206, headers: { 'Content-Range': 'bytes 4-9/10' } }))
  const progress: number[] = []

  const blob = await downloadPack(7, 'tok', (f) => progress.push(f), fetchFn)

  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES)
  const second = fetchFn.mock.calls[1][1]!.headers as Record<string, string>
  expect(second.Range).toBe('bytes=4-')
  expect(second.Authorization).toBe('Bearer tok')
  expect(progress.at(-1)).toBe(1)
})

test('a server that ignores the range restarts the file instead of duplicating bytes', async () => {
  const fetchFn = vi.fn<typeof fetch>()
  fetchFn.mockResolvedValueOnce(new Response(body(BYTES.slice(0, 4), true), { status: 200, headers: { 'Content-Length': '10' } }))
  fetchFn.mockResolvedValueOnce(new Response(body(BYTES, false), { status: 200, headers: { 'Content-Length': '10' } }))
  const blob = await downloadPack(7, 'tok', () => {}, fetchFn)
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES)
})

test('no signal at all gives up after a few tries with a plain message', async () => {
  const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
  await expect(downloadPack(7, 'tok', () => {}, fetchFn)).rejects.toThrow(/No signal/)
  expect(fetchFn).toHaveBeenCalledTimes(4)
})

test('a refused login is not retried', async () => {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ detail: 'Not signed in.' }), { status: 401 }))
  await expect(downloadPack(7, 'tok', () => {}, fetchFn)).rejects.toMatchObject({ status: 401 })
  expect(fetchFn).toHaveBeenCalledTimes(1)
})
