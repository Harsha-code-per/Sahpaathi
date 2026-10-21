import { describe, expect, it } from 'vitest'
import { cost, DEFAULTS, LESSON_COST, LESSONS_PER_LANGUAGE, rupees } from './costModel'

// The three rows of the table in docs/ROADMAP.md ("What it costs"), to the rupee the document states.
describe('matches the roadmap table', () => {
  it('10 classrooms, 1 language: about ₹9,400 a classroom and ₹313 a child (₹227 without calls)', () => {
    const c = cost({ ...DEFAULTS, classrooms: 10 })
    expect(Math.round(c.perClassroom / 100) * 100).toBe(9400)
    expect(Math.round(c.perChild)).toBe(313)
    expect(Math.round(c.perChildWithoutCalls)).toBe(227)
  })

  it('1,000 classrooms, 1 language: about ₹2,850 and ₹95 a child (₹9 without calls)', () => {
    const c = cost(DEFAULTS)
    expect(Math.round(c.perClassroom / 10) * 10).toBe(2850)
    expect(Math.round(c.perChild)).toBe(95)
    expect(Math.round(c.perChildWithoutCalls)).toBe(9)
  })

  it('1,00,000 classrooms, 10 languages: about ₹2,780 and ₹93 a child (₹6 without calls)', () => {
    const c = cost({ ...DEFAULTS, classrooms: 100_000, languages: 10 })
    expect(Math.round(c.perClassroom / 10) * 10).toBe(2780)
    expect(Math.round(c.perChild)).toBe(93)
    expect(Math.round(c.perChildWithoutCalls)).toBe(6)
  })
})

describe('the assumptions behind it', () => {
  it('a year of lessons in one language is 324, at ₹205 each', () => {
    expect(LESSONS_PER_LANGUAGE).toBe(324)
    expect(LESSON_COST * LESSONS_PER_LANGUAGE).toBe(66_420)
  })

  it('648 calls a classroom a year at 30 children, 20% absent', () => {
    expect(cost(DEFAULTS).callsPerClassroom).toBeCloseTo(648)
  })

  it('catch-up calls are about nine-tenths of the cost at scale', () => {
    const c = cost(DEFAULTS)
    expect(c.calls / c.perClassroom).toBeGreaterThan(0.85)
  })

  it('no calls, no cost for them; more languages cost more content but only once', () => {
    expect(cost({ ...DEFAULTS, absentPct: 0 }).calls).toBe(0)
    expect(cost({ ...DEFAULTS, languages: 3 }).content).toBeCloseTo(3 * cost(DEFAULTS).content)
  })

  it('never divides by zero', () => {
    const c = cost({ classrooms: 0, languages: 0, children: 0, absentPct: 20, callMinutes: 4, ratePerMinute: 1 })
    expect(Number.isFinite(c.perChild)).toBe(true)
  })

  it('writes rupees the Indian way', () => {
    expect(rupees(66_420)).toBe('₹66,420')
    expect(rupees(1_234_567)).toBe('₹12,34,567')
  })
})
