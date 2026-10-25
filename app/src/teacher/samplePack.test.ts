import { describe, expect, it } from 'vitest'
import { parseEpisode } from '../packs/episode'
import { samplePacks } from './samplePack'

describe('built-in sample lessons', () => {
  it('each parses, and ids are unique', () => {
    for (const { episode } of samplePacks) expect(() => parseEpisode(episode), episode.id).not.toThrow()
    expect(new Set(samplePacks.map((s) => s.episode.id)).size).toBe(samplePacks.length)
  })

  it('every sum in math_checks is right', () => {
    for (const { episode } of samplePacks)
      for (const s of episode.segments)
        for (const m of s.math_checks) {
          const [a, op, b, op2, c] = m.expr.split(' ')
          const f = (x: number, o: string, y: number) => (o === '+' ? x + y : x - y)
          const v = op2 ? f(f(+a, op, +b), op2, +c) : f(+a, op, +b)
          expect(v, `${episode.id} ${m.expr}`).toBe(m.answer)
        }
  })

  it('uses more than one kind of activity', () => {
    const kinds = new Set(samplePacks.flatMap((s) => s.episode.segments.map((g) => g.activity)))
    expect(kinds.size).toBeGreaterThanOrEqual(5)
  })
})
