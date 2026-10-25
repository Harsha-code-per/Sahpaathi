import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, lineSeconds, parsePrefs, pauseSeconds, roomFromDb } from './prefs'

describe('player prefs', () => {
  it('falls back to defaults for missing, broken or out-of-range values', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{"rate":3,"answer":"x","text":"huge","boost":9}')).toEqual(DEFAULT_PREFS)
  })
  it('keeps valid values', () => {
    expect(parsePrefs('{"rate":0.8,"answer":2,"text":"xl","boost":1.5}')).toEqual({ rate: 0.8, answer: 2, text: 'xl', boost: 1.5 })
  })
  it('slows timed text and lengthens pauses', () => {
    expect(lineSeconds(100, { ...DEFAULT_PREFS, rate: 0.8 })).toBeCloseTo(8.75)
    expect(pauseSeconds(4, { ...DEFAULT_PREFS, answer: 1.5 })).toBe(6)
  })
  it('judges the room from its level', () => {
    expect(roomFromDb(-60)).toBe('quiet')
    expect(roomFromDb(-42)).toBe('busy')
    expect(roomFromDb(-20)).toBe('loud')
  })
})
