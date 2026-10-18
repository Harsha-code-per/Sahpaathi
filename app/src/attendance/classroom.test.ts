import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDB, isCode } from '../storage/db'
import { getClassroom, parseRolls, saveClassroom } from './classroom'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

describe('isCode', () => {
  it('accepts opaque codes', () => {
    expect(isCode('G2-A')).toBe(true)
    expect(isCode('17')).toBe(true)
  })

  it('rejects names, phone numbers, the empty string and overlong codes', () => {
    expect(isCode('Ravi Kumar')).toBe(false)
    expect(isCode('+919876543210')).toBe(false)
    expect(isCode('')).toBe(false)
    expect(isCode('A'.repeat(41))).toBe(false)
  })
})

describe('parseRolls', () => {
  it('expands a range low to high', () => {
    expect(parseRolls('1-5')).toEqual(['1', '2', '3', '4', '5'])
  })

  it('takes a comma list, kept in the order typed', () => {
    expect(parseRolls('1,3,7')).toEqual(['1', '3', '7'])
  })

  it('mixes ranges and lists, dropping duplicates', () => {
    expect(parseRolls('1-3, 2, 7')).toEqual(['1', '2', '3', '7'])
  })

  it('rejects backwards ranges, names and empty input', () => {
    expect(() => parseRolls('5-1')).toThrow(/backwards/)
    expect(() => parseRolls('Ravi Kumar')).toThrow(/not a roll number/)
    expect(() => parseRolls('')).toThrow(/Add roll numbers/)
  })

  it('rejects a list that would freeze the phone', () => {
    expect(() => parseRolls('1-1000')).toThrow(/999/)
  })

  it('rejects a huge typo range at once, without expanding it', () => {
    const t = performance.now()
    expect(() => parseRolls('1-30000000')).toThrow(/999/)
    expect(performance.now() - t).toBeLessThan(50)
  })
})

describe('classroom', () => {
  it('saves and reads the record, and saving again replaces it', async () => {
    const a = await saveClassroom({ classroom_id: 'G2-A', rolls: parseRolls('1-3') })
    expect(await getClassroom()).toEqual(a)
    const b = await saveClassroom({ classroom_id: 'G3-B', rolls: parseRolls('4') })
    expect(await getClassroom()).toEqual(b)
  })

  it('refuses names and missing rolls before anything is stored', async () => {
    await expect(saveClassroom({ classroom_id: 'Ravi Kumar', rolls: ['1'] })).rejects.toThrow(/classroom code/i)
    await expect(saveClassroom({ classroom_id: 'G2-A', rolls: [] })).rejects.toThrow(/Add roll numbers/)
    await expect(saveClassroom({ classroom_id: 'G2-A', rolls: ['Ravi Kumar'] })).rejects.toThrow(/roll number/)
    expect(await getClassroom()).toBeNull()
  })
})
