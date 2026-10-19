import { strFromU8, unzipSync } from 'fflate'
import type { Episode } from '../lib/types'
import { parseEpisode } from './episode'

// Checks a .sahpaathi pack before anything from it is stored or played (docs/EPISODE_SCHEMA.md, "Pack").
//
// Layout this verifier expects:
//   manifest.json  { sha256: { <path>: <hex> }, signature: <base64 Ed25519> }  (any other keys are unsigned and ignored)
//   episode.json   the Episode
//   audio/*.opus   sketch.svg   ...
// The signature covers the sha256 map, and the map covers every other file, so the episode is signed too.
// (An episode embedded in manifest.json would sit outside the signature, so it is refused.)

export class PackError extends Error {}

/** Unzipped size cap: an hour of 16 kbps audio is ~7 MB, so this only stops zip bombs. */
export const MAX_PACK_BYTES = 64 * 1024 * 1024
const MAX_FILES = 2_000

export interface VerifiedPack {
  episode: Episode
  /** line id -> audio file bytes, for lines that have audio. */
  audio: Record<string, Uint8Array<ArrayBuffer>>
}

/**
 * The exact bytes the pack builder signs: the sha256 map as JSON, keys sorted, no whitespace.
 * Python: json.dumps(sha256, sort_keys=True, separators=(",", ":")).encode()
 */
export function signedBytes(sha256: Record<string, string>) {
  const sorted = Object.fromEntries(Object.keys(sha256).sort().map((k) => [k, sha256[k]]))
  return new TextEncoder().encode(JSON.stringify(sorted))
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function fromBase64(b64: string, what: string) {
  try {
    return Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0))
  } catch {
    throw new PackError(`${what} is not valid base64.`)
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function signatureIsValid(publicKeyB64: string, signatureB64: string, data: Uint8Array<ArrayBuffer>) {
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('raw', fromBase64(publicKeyB64, 'The pack signing key'), { name: 'Ed25519' }, false, ['verify'])
  } catch (e) {
    if (e instanceof PackError) throw e
    if (e instanceof DOMException && e.name === 'NotSupportedError') {
      throw new PackError('This browser cannot check pack signatures. Please update Chrome.')
    }
    throw new PackError('The pack signing key configured in this app is invalid.')
  }
  return crypto.subtle.verify({ name: 'Ed25519' }, key, fromBase64(signatureB64, 'The pack signature'), data)
}

function unzip(zip: Uint8Array) {
  let total = 0
  let count = 0
  try {
    return unzipSync(zip, {
      filter: (f) => {
        total += f.originalSize
        if (++count > MAX_FILES || total > MAX_PACK_BYTES) throw new PackError('This pack is too large.')
        return !f.name.endsWith('/')
      },
    })
  } catch (e) {
    if (e instanceof PackError) throw e
    throw new PackError('This file is not a Sahpaathi pack (it could not be opened as a zip).')
  }
}

function json(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    throw new PackError(`${name} is not valid JSON.`)
  }
}

/** Verifies a pack against the team's Ed25519 public key (raw 32 bytes, base64). Throws PackError with a teacher-readable reason. */
export async function verifyPack(zip: Uint8Array, publicKeyB64: string | undefined): Promise<VerifiedPack> {
  if (!publicKeyB64) throw new PackError('No pack signing key is set up in this app yet, so it cannot check lessons. Please tell your Sahpaathi admin.')
  const files = unzip(zip) as Record<string, Uint8Array<ArrayBuffer>>

  if (!files['manifest.json']) throw new PackError('This pack has no manifest.json.')
  const manifest = json(files['manifest.json'], 'manifest.json')
  if (!isObject(manifest) || !isObject(manifest.sha256) || typeof manifest.signature !== 'string') {
    throw new PackError('manifest.json must contain "sha256" and "signature".')
  }
  const sha256 = manifest.sha256 as Record<string, string>
  for (const [path, hex] of Object.entries(sha256)) {
    if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/.test(hex)) throw new PackError(`The hash for "${path}" is malformed.`)
  }

  // 1. The hash list really comes from us.
  if (!(await signatureIsValid(publicKeyB64, manifest.signature, signedBytes(sha256)))) {
    throw new PackError('The pack signature is not valid: it was changed after signing or did not come from Sahpaathi.')
  }

  // 2. Every file is listed and unchanged, and nothing listed is missing.
  const paths = Object.keys(files).filter((p) => p !== 'manifest.json')
  for (const p of paths) if (!(p in sha256)) throw new PackError(`"${p}" is in the pack but not signed.`)
  for (const [p, hex] of Object.entries(sha256)) {
    if (!files[p]) throw new PackError(`"${p}" is signed but missing from the pack.`)
    if ((await sha256Hex(files[p])) !== hex) throw new PackError(`"${p}" was changed after the pack was signed.`)
  }

  // 3. The (now trusted) episode has the shape the player needs.
  if (!files['episode.json']) {
    throw new PackError(
      'episode' in manifest
        ? 'This pack keeps its episode inside manifest.json, where the signature does not cover it. Rebuild it with episode.json.'
        : 'This pack has no episode.json.',
    )
  }
  let episode: Episode
  try {
    episode = parseEpisode(json(files['episode.json'], 'episode.json'))
  } catch (e) {
    throw e instanceof PackError ? e : new PackError(`The lesson in this pack is invalid (${(e as Error).message}).`)
  }

  // 4. Audio comes only from signed paths audio/<line_id>.opus. manifest.audio is ignored: it sits outside the
  //    signature, so trusting it would let anyone remap a line to a different (signed) clip.
  const lineIds = new Set(
    [...episode.segments.flatMap((s) => [...s.teach, ...s.easier, ...s.core, ...s.stretch]), ...episode.analogy, ...episode.ivr_recap].map((l) => l.id),
  )
  const audio: VerifiedPack['audio'] = {}
  for (const p of paths) {
    const id = /^audio\/(.+)\.opus$/.exec(p)?.[1]
    if (id === undefined) continue
    if (!lineIds.has(id)) throw new PackError(`The pack has audio for "${id}", which is not a line in this lesson.`)
    audio[id] = files[p]
  }
  return { episode, audio }
}
