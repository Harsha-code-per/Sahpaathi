import { describe, expect, it } from 'vitest'
import { FEEDBACK_TAGS } from '../storage/db'
import { STRINGS, UI_LANGS } from './strings'

describe('every teacher language is complete', () => {
  for (const { lang } of UI_LANGS) {
    const t = STRINGS[lang]
    it(`${lang}: five steps, a word for every feedback tag, and working number phrases`, () => {
      expect(t.steps).toHaveLength(5)
      expect(t.steps.every((s) => s.length > 15)).toBe(true)
      expect(Object.keys(t.feedbackTags).sort()).toEqual([...FEEDBACK_TAGS].sort())
      for (const tag of FEEDBACK_TAGS) expect(t.feedbackTags[tag].length).toBeGreaterThan(1)
      for (const n of [0, 1, 2, 25]) {
        expect(t.playedDays(n)).toContain(n === 1 ? '' : String(n))
        expect(t.absentCount(n).length).toBeGreaterThan(2)
        expect(t.missedTimes(n)).toBeTruthy()
        expect(t.feedbackStars(Math.min(n, 5))).toContain(String(Math.min(n, 5)))
      }
      expect(t.yourRating(4.5)).toContain('4.5')
    })
  }

  it('the Tamil, Hindi and Odia text is in the right script, not left in English', () => {
    expect(STRINGS.ta.tabClass).toMatch(/[\u0B80-\u0BFF]/)
    expect(STRINGS.hi.tabClass).toMatch(/[\u0900-\u097F]/)
    expect(STRINGS.or.tabClass).toMatch(/[\u0B00-\u0B7F]/)
  })
})
