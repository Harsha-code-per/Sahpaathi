import { describe, expect, it } from 'vitest'
import { samplePack } from '../teacher/samplePack'
import { parseEpisode } from './episode'

const sample = samplePack.episode
const clone = () => structuredClone(sample) as unknown as Record<string, any>

describe('parseEpisode', () => {
  it('accepts the sample episode', () => {
    expect(parseEpisode(structuredClone(sample))).toEqual(sample)
  })

  it.each([
    ['not an object', () => 'x', /episode: must be an object/],
    ['a newer schema', () => ({ ...clone(), schema_version: 2 }), /unsupported schema_version 2/],
    ['no title', () => ({ ...clone(), title: '' }), /"title" must be a non-empty string/],
    ['no segments', () => ({ ...clone(), segments: [] }), /"segments" must be a non-empty list/],
    ['a sketch that is not SVG', () => ({ ...clone(), chalk_sketch_svg: '<script>' }), /must be an SVG/],
    ['materials that are not strings', () => ({ ...clone(), materials: [1] }), /"materials" must be a list of strings/],
  ])('rejects %s', (_, make, message) => {
    expect(() => parseEpisode(make())).toThrow(message)
  })

  it('rejects a missing cue (exported episodes always write every key)', () => {
    const e = clone()
    delete e.segments[0].teach[0].cue
    expect(() => parseEpisode(e)).toThrow(/segments\[0\]\.teach\[0\]: "cue" must be a string or null/)
  })

  it('rejects an unknown language', () => {
    const e = clone()
    e.analogy[0].lang = 'fr'
    expect(() => parseEpisode(e)).toThrow(/analogy\[0\]: unknown language "fr"/)
  })

  it('rejects a negative pause', () => {
    const e = clone()
    e.segments[0].core[0].pause_after_sec = -1
    expect(() => parseEpisode(e)).toThrow(/"pause_after_sec" must be a number/)
  })

  it('rejects line ids used twice anywhere in the episode', () => {
    const e = clone()
    e.ivr_recap[0].id = e.segments[0].teach[0].id
    expect(() => parseEpisode(e)).toThrow(/ivr_recap\[0\]: duplicate line id/)
  })

  it('rejects a segment missing a branch', () => {
    const e = clone()
    delete e.segments[0].stretch
    expect(() => parseEpisode(e)).toThrow(/segments\[0\]\.stretch: must be a list of lines/)
  })
})
