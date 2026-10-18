import type { Episode, Line } from '../lib/types'

// Shape check for episodes arriving in packs. The factory validates fully (schema.py); this only guards what the
// player relies on, so a malformed pack fails at import with a clear message instead of mid-lesson.

const LANGS = new Set(['ta', 'hi', 'or', 'sat', 'en'])

const fail = (where: string, what: string): never => {
  throw new Error(`${where}: ${what}`)
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(o: Record<string, unknown>, key: string, where: string) {
  if (typeof o[key] !== 'string' || o[key] === '') fail(where, `"${key}" must be a non-empty string`)
}

function lines(v: unknown, where: string, ids: Set<string>): asserts v is Line[] {
  if (!Array.isArray(v)) fail(where, 'must be a list of lines')
  ;(v as unknown[]).forEach((l, i) => {
    const at = `${where}[${i}]`
    if (!isObject(l)) return fail(at, 'must be an object')
    str(l, 'id', at)
    str(l, 'text', at)
    if (!LANGS.has(l.lang as string)) fail(at, `unknown language "${String(l.lang)}"`)
    if (typeof l.pause_after_sec !== 'number' || !(l.pause_after_sec >= 0)) fail(at, '"pause_after_sec" must be a number ≥ 0')
    if (l.cue !== null && typeof l.cue !== 'string') fail(at, '"cue" must be a string or null')
    if (ids.has(l.id as string)) fail(at, `duplicate line id "${String(l.id)}"`)
    ids.add(l.id as string)
  })
}

/** Returns the episode if it has the shape the player needs, otherwise throws with the first problem found. */
export function parseEpisode(v: unknown): Episode {
  if (!isObject(v)) return fail('episode', 'must be an object')
  if (v.schema_version !== 1) fail('episode', `unsupported schema_version ${String(v.schema_version)} (this app reads 1)`)
  str(v, 'id', 'episode')
  str(v, 'title', 'episode')
  if (!Array.isArray(v.materials) || !v.materials.every((m) => typeof m === 'string')) fail('episode', '"materials" must be a list of strings')
  if (typeof v.chalk_sketch_svg !== 'string' || !v.chalk_sketch_svg.trimStart().startsWith('<svg')) fail('episode', '"chalk_sketch_svg" must be an SVG')
  if (!Array.isArray(v.segments) || v.segments.length === 0) fail('episode', '"segments" must be a non-empty list')

  const ids = new Set<string>()
  ;(v.segments as unknown[]).forEach((s, i) => {
    const at = `segments[${i}]`
    if (!isObject(s)) return fail(at, 'must be an object')
    str(s, 'id', at)
    str(s, 'title', at)
    str(s, 'checkpoint', at)
    for (const part of ['teach', 'easier', 'core', 'stretch']) lines(s[part], `${at}.${part}`, ids)
  })
  lines(v.analogy, 'analogy', ids)
  lines(v.ivr_recap, 'ivr_recap', ids)
  return v as unknown as Episode
}
