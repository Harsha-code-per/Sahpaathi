import { describe, expect, it } from 'vitest'
import sample from '../../../content/samples/g1-numbers-to-20-chennai-migrant.json'
import review from '../../../content/samples/g1-numbers-to-20-chennai-migrant.review.json'
import type { Episode } from '../lib/types'
import type { Review } from './api'
import { allLines, glossById, issuesByLine, schoolShare, svgDataUrl } from './view'

const ep = sample as unknown as Episode
const rev = review as unknown as Review

describe('studio view helpers', () => {
  it('measures the language handover like the backend rule (rising, last ≥ 50%)', () => {
    const shares = ep.segments.map((_, i) => schoolShare(ep, i))
    expect(shares[0]).toBeLessThan(0.5)
    expect(shares.at(-1)).toBeGreaterThanOrEqual(0.5)
  })

  it('pins every issue to its line, and unknown ids to the episode', () => {
    const byLine = issuesByLine(ep, rev)
    const pinned = [...byLine.values()].flat()
    expect(pinned).toHaveLength(rev.rubric.issues.length)
    const ids = new Set(allLines(ep).map((l) => l.id))
    for (const key of byLine.keys()) expect(key === 'episode' || ids.has(key)).toBe(true)
  })

  it('has an English gloss for every line', () => {
    const gloss = glossById(rev)
    expect(allLines(ep).every((l) => gloss.has(l.id))).toBe(true)
  })

  it('turns the sketch into an inert image URL', () => {
    const url = svgDataUrl('<svg onload="alert(1)"></svg>')
    expect(url.startsWith('data:image/svg+xml')).toBe(true)
    expect(url).not.toContain('<')
  })
})
