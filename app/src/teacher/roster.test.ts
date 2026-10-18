import { describe, expect, it } from 'vitest'
import { loadSetup, MAX_CLASS_SIZE, NO_CLASS, saveSetup, setupProblem, toggleRoll } from './roster'

const memory = (initial?: string) => {
  let v = initial ?? null
  return { getItem: () => v, setItem: (_: string, x: string) => void (v = x) }
}

describe('toggleRoll', () => {
  it('adds and removes a roll number, keeping the list sorted', () => {
    expect(toggleRoll([], 12)).toEqual([12])
    expect(toggleRoll([12], 7)).toEqual([7, 12])
    expect(toggleRoll([7, 12], 7)).toEqual([12])
  })

  it('does not change the list it was given', () => {
    const before = [3]
    toggleRoll(before, 1)
    expect(before).toEqual([3])
  })
})

describe('setupProblem', () => {
  it('accepts a plain class code and a sensible class size', () => {
    expect(setupProblem({ classroom: 'CHN-04', size: 32 })).toBeNull()
    expect(setupProblem({ classroom: '3B', size: 1 })).toBeNull()
  })

  it('refuses anything that looks like a name or a phone number', () => {
    for (const classroom of ['', 'St Mary school', "Asha's class", '+919876543210', '-x', 'a'.repeat(41)]) {
      expect(setupProblem({ classroom, size: 30 })).toMatch(/Class code/)
    }
  })

  it('refuses a class size that is not a whole number from 1 to the maximum', () => {
    for (const size of [0, -3, 2.5, NaN, MAX_CLASS_SIZE + 1]) {
      expect(setupProblem({ classroom: 'CLASS-1', size })).toMatch(/Number of children/)
    }
  })
})

describe('the remembered class', () => {
  it('is saved and loaded back', () => {
    const store = memory()
    saveSetup({ classroom: 'CLASS-1', size: 28 }, store)
    expect(loadSetup(store)).toEqual({ classroom: 'CLASS-1', size: 28 })
  })

  it('falls back to "not set up" when nothing, junk or an unusable class is stored', () => {
    expect(loadSetup(memory())).toEqual(NO_CLASS)
    expect(loadSetup(memory('{not json'))).toEqual(NO_CLASS)
    expect(loadSetup(memory(JSON.stringify({ classroom: 'Asha Kumar', size: 30 })))).toEqual(NO_CLASS)
    expect(loadSetup(memory(JSON.stringify({ classroom: 'CLASS-1' })))).toEqual(NO_CLASS)
  })
})
