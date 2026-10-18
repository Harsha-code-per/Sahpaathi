import { strToU8, zipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { samplePack } from '../teacher/samplePack'
import { MAX_PACK_BYTES, PackError, signedBytes, verifyPack } from './verify'

const sample = samplePack.episode
const lineId = sample.segments[0].teach[0].id
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const hex = async (b: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) => x.toString(16).padStart(2, '0')).join('')

let signer: CryptoKey
let publicKey: string
let otherSigner: CryptoKey

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  signer = pair.privateKey
  publicKey = toB64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  otherSigner = ((await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair).privateKey
})

interface Options {
  files?: Record<string, string | Uint8Array>
  manifest?: Record<string, unknown>
  /** Runs after signing: simulates tampering in transit. */
  tamper?: (files: Record<string, Uint8Array>, manifest: Record<string, unknown>) => void
  key?: CryptoKey
}

/** Builds a signed pack the way voice/ should: hash every file, sign the sorted hash map, zip. */
async function makePack({ files, manifest = {}, tamper, key }: Options = {}) {
  const contents: Record<string, Uint8Array> = {}
  const all = files ?? {
    'episode.json': JSON.stringify(sample),
    'sketch.svg': sample.chalk_sketch_svg,
    [`audio/${lineId}.opus`]: new Uint8Array([79, 103, 103, 83, 1, 2, 3]),
  }
  for (const [p, v] of Object.entries(all)) contents[p] = typeof v === 'string' ? strToU8(v) : v
  const sha256: Record<string, string> = {}
  for (const [p, v] of Object.entries(contents)) sha256[p] = await hex(v as Uint8Array<ArrayBuffer>)
  const signature = toB64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key ?? signer, signedBytes(sha256))))
  const m: Record<string, unknown> = { sha256, signature, ...manifest }
  tamper?.(contents, m)
  return zipSync({ ...contents, 'manifest.json': strToU8(JSON.stringify(m)) })
}

/** `key: null` means no key configured. */
const rejects = async (zip: Uint8Array, message: RegExp, key: string | null = publicKey) => {
  const err = await verifyPack(zip, key ?? undefined).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(PackError)
  expect((err as PackError).message).toMatch(message)
}

describe('signedBytes', () => {
  it('matches Python json.dumps(sort_keys=True, separators=(",", ":"))', () => {
    expect(new TextDecoder().decode(signedBytes({ 'sketch.svg': 'bb', 'audio/a.opus': 'aa' }))).toBe(
      '{"audio/a.opus":"aa","sketch.svg":"bb"}',
    )
  })
})

describe('verifyPack', () => {
  it('accepts a correctly signed pack and returns the episode and audio', async () => {
    const pack = await verifyPack(await makePack(), publicKey)
    expect(pack.episode).toEqual(sample)
    expect(Object.keys(pack.audio)).toEqual([lineId])
    expect([...pack.audio[lineId]]).toEqual([79, 103, 103, 83, 1, 2, 3])
  })

  it('uses manifest.audio when the pack provides one', async () => {
    const zip = await makePack({
      files: { 'episode.json': JSON.stringify(sample), 'voice/first.opus': new Uint8Array([1]) },
      manifest: { audio: { [lineId]: 'voice/first.opus' } },
    })
    expect(Object.keys((await verifyPack(zip, publicKey)).audio)).toEqual([lineId])
  })

  it('accepts a pack with no audio (text-only lesson)', async () => {
    const zip = await makePack({ files: { 'episode.json': JSON.stringify(sample) } })
    expect((await verifyPack(zip, publicKey)).audio).toEqual({})
  })

  it('refuses everything when no signing key is configured', async () => {
    await rejects(await makePack(), /No pack signing key/, null)
  })

  it('refuses a key that is not a valid Ed25519 key', async () => {
    await rejects(await makePack(), /signing key configured in this app is invalid/, toB64(new Uint8Array(5)))
  })

  it('refuses a file that is not a zip', async () => {
    await rejects(strToU8('hello'), /could not be opened as a zip/)
  })

  it('refuses a zip without a manifest', async () => {
    await rejects(zipSync({ 'episode.json': strToU8('{}') }), /no manifest\.json/)
  })

  it('refuses a malformed manifest', async () => {
    await rejects(zipSync({ 'manifest.json': strToU8('{oops') }), /manifest\.json is not valid JSON/)
    await rejects(zipSync({ 'manifest.json': strToU8('{"sha256":{}}') }), /must contain "sha256" and "signature"/)
  })

  it('refuses a pack signed by someone else', async () => {
    await rejects(await makePack({ key: otherSigner }), /signature is not valid/)
  })

  it('refuses a pack whose hash list was edited after signing', async () => {
    const zip = await makePack({
      tamper: (files, m) => {
        files['extra.txt'] = strToU8('x')
        ;(m.sha256 as Record<string, string>)['extra.txt'] = 'a'.repeat(64)
      },
    })
    await rejects(zip, /signature is not valid/)
  })

  it('refuses a pack whose audio was swapped after signing', async () => {
    const zip = await makePack({ tamper: (files) => (files[`audio/${lineId}.opus`] = new Uint8Array([9, 9, 9])) })
    await rejects(zip, new RegExp(`"audio/${lineId}.opus" was changed`))
  })

  it('refuses a pack whose lesson text was edited after signing', async () => {
    const zip = await makePack({ tamper: (files) => (files['episode.json'] = strToU8(JSON.stringify({ ...sample, title: 'Hacked' }))) })
    await rejects(zip, /"episode\.json" was changed/)
  })

  it('refuses unsigned extra files', async () => {
    await rejects(await makePack({ tamper: (files) => (files['run-me.js'] = strToU8('alert(1)')) }), /"run-me\.js" is in the pack but not signed/)
  })

  it('refuses a pack with a signed file missing', async () => {
    await rejects(await makePack({ tamper: (files) => delete files['sketch.svg'] }), /"sketch\.svg" is signed but missing/)
  })

  it('refuses an episode kept only inside manifest.json, where the signature does not reach', async () => {
    const zip = await makePack({ files: { 'sketch.svg': sample.chalk_sketch_svg }, manifest: { episode: sample } })
    await rejects(zip, /inside manifest\.json, where the signature does not cover it/)
  })

  it('refuses a signed but invalid lesson', async () => {
    const zip = await makePack({ files: { 'episode.json': JSON.stringify({ ...sample, schema_version: 2 }) } })
    await rejects(zip, /lesson in this pack is invalid \(episode: unsupported schema_version 2/)
  })

  it('refuses audio for a line that is not in the lesson', async () => {
    const zip = await makePack({ files: { 'episode.json': JSON.stringify(sample), 'audio/nope.opus': new Uint8Array([1]) } })
    await rejects(zip, /audio for "nope", which is not a line/)
  })

  it('refuses manifest.audio pointing at a file that is not there', async () => {
    const zip = await makePack({ files: { 'episode.json': JSON.stringify(sample) }, manifest: { audio: { [lineId]: 'audio/missing.opus' } } })
    await rejects(zip, new RegExp(`audio for "${lineId}" is missing`))
  })

  it('refuses packs that unzip to more than the size cap', async () => {
    const big = new Uint8Array(MAX_PACK_BYTES + 1)
    await rejects(zipSync({ 'manifest.json': strToU8('{}'), 'big.bin': big }), /too large/)
  })
})
