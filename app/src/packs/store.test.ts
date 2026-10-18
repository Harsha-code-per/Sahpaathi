import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { strToU8, zipSync } from 'fflate'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDB } from '../storage/db'
import { samplePack } from '../teacher/samplePack'
import { deletePack, importPack, listPacks, loadPackFiles } from './store'
import { PackError, signedBytes } from './verify'

const sample = samplePack.episode
const lineId = sample.segments[0].teach[0].id
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

let signer: CryptoKey
let publicKey: string

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  signer = pair.privateKey
  publicKey = toB64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
})

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

async function packFile(episode = sample) {
  const files: Record<string, Uint8Array<ArrayBuffer>> = {
    'episode.json': strToU8(JSON.stringify(episode)) as Uint8Array<ArrayBuffer>,
    [`audio/${lineId}.opus`]: new Uint8Array([1, 2, 3]),
  }
  const sha256: Record<string, string> = {}
  for (const [p, b] of Object.entries(files)) {
    sha256[p] = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) => x.toString(16).padStart(2, '0')).join('')
  }
  const signature = toB64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signer, signedBytes(sha256))))
  const zip = zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify({ sha256, signature })) })
  return new Blob([zip as Uint8Array<ArrayBuffer>])
}

describe('pack store', () => {
  it('imports a verified pack and keeps its audio and original zip', async () => {
    const file = await packFile()
    const pack = await importPack(file, publicKey, new Date('2026-10-19T04:00:00Z'))
    expect(pack).toEqual({ id: sample.id, episode: sample, imported_at: '2026-10-19T04:00:00.000Z' })
    expect(await listPacks()).toEqual([pack])
    const files = await loadPackFiles(sample.id)
    expect([...files!.audio[lineId]]).toEqual([1, 2, 3])
    expect(files!.zip).toEqual(new Uint8Array(await file.arrayBuffer()))
  })

  it('stores nothing when verification fails', async () => {
    await expect(importPack(new Blob(['not a zip']), publicKey)).rejects.toBeInstanceOf(PackError)
    expect(await listPacks()).toEqual([])
  })

  it('replaces a lesson when the same episode is imported again', async () => {
    await importPack(await packFile(), publicKey, new Date('2026-10-19T04:00:00Z'))
    await importPack(await packFile({ ...sample, title: 'Revised' }), publicKey, new Date('2026-10-20T04:00:00Z'))
    const packs = await listPacks()
    expect(packs).toHaveLength(1)
    expect(packs[0].episode.title).toBe('Revised')
  })

  it('lists newest first', async () => {
    await importPack(await packFile({ ...sample, id: 'older' }), publicKey, new Date('2026-10-19T04:00:00Z'))
    await importPack(await packFile({ ...sample, id: 'newer' }), publicKey, new Date('2026-10-20T04:00:00Z'))
    expect((await listPacks()).map((p) => p.id)).toEqual(['newer', 'older'])
  })

  it('deletes the lesson and its files', async () => {
    await importPack(await packFile(), publicKey)
    await deletePack(sample.id)
    expect(await listPacks()).toEqual([])
    expect(await loadPackFiles(sample.id)).toBeUndefined()
  })
})
