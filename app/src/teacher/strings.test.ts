import { describe, expect, it, vi } from 'vitest'
import { FEEDBACK_TAGS } from '../storage/db'
import { STRINGS, UI_LANGS, initialLang, saveLang } from './strings'

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

  it('every phrase that is a function returns text in every language', () => {
    for (const { lang } of UI_LANGS) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        if (typeof value !== 'function') continue
        const fn = value as (...a: number[]) => unknown
        for (const args of [[1], [2, 3], [0, 0, 0]]) expect(String(fn(...args)).length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('the saved language is read back, and a bad one is ignored', () => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) })
    expect(initialLang()).toBe('en')
    saveLang('ta')
    expect(initialLang()).toBe('ta')
    m.set('sahpaathi.ui-lang', 'xx')
    expect(initialLang()).toBe('en')
    vi.unstubAllGlobals()
  })

  it('the Tamil, Hindi and Odia text is in the right script, not left in English', () => {
    expect(STRINGS.ta.tabClass).toMatch(/[\u0B80-\u0BFF]/)
    expect(STRINGS.hi.tabClass).toMatch(/[\u0900-\u097F]/)
    expect(STRINGS.or.tabClass).toMatch(/[\u0B00-\u0B7F]/)
  })
})
