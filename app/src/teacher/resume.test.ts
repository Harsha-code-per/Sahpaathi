import { beforeEach, describe, expect, it } from 'vitest'
import { loadSpot, saveSpot } from './resume'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage
})

describe('resume spot', () => {
  it('remembers a mid-lesson spot for that lesson only', () => {
    saveSpot('a', { kind: 'line', seg: 1, part: 'core', line: 0 })
    expect(loadSpot('a', 3)).toEqual({ kind: 'line', seg: 1, part: 'core', line: 0 })
    expect(loadSpot('b', 3)).toBeNull()
  })
  it('ignores the very first line, a spot past the end, and finished lessons', () => {
    saveSpot('a', { kind: 'line', seg: 0, part: 'teach', line: 0 })
    expect(loadSpot('a', 3)).toBeNull()
    saveSpot('a', { kind: 'checkpoint', seg: 5 })
    expect(loadSpot('a', 3)).toBeNull()
    saveSpot('a', { kind: 'checkpoint', seg: 1 })
    saveSpot('a', { kind: 'done' })
    expect(loadSpot('a', 3)).toBeNull()
  })
})
