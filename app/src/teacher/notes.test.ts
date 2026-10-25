import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDB, type NoteRecord } from '../storage/db'
import { MAX_NOTE_BYTES, deleteNote, formatSize, groupNotes, listNotes, noteProblem, saveNote, storageUsage, titleFromName } from './notes'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => vi.unstubAllGlobals())

const note = (id: string, over: Partial<NoteRecord> = {}): NoteRecord => ({
  id,
  title: id,
  subject: 'general',
  grade: 0,
  size: 10,
  blob: new Blob(['%PDF']),
  at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('what can go on the shelf', () => {
  it('takes a PDF by type or by name, and nothing else', () => {
    expect(noteProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull()
    expect(noteProblem({ name: 'Maths.PDF', type: '', size: 10 })).toBeNull() // some phones send no type
    expect(noteProblem({ name: 'photo.jpg', type: 'image/jpeg', size: 10 })).toBe('type')
  })
  it('refuses a file over 25 MB', () => {
    expect(noteProblem({ name: 'a.pdf', type: 'application/pdf', size: MAX_NOTE_BYTES })).toBeNull()
    expect(noteProblem({ name: 'a.pdf', type: 'application/pdf', size: MAX_NOTE_BYTES + 1 })).toBe('size')
  })
  it('makes a readable title from a file name', () => {
    expect(titleFromName('class3_maths-mela.pdf')).toBe('class3 maths mela')
    expect(titleFromName('.pdf')).toBe('Notes')
  })
})

describe('the shelf', () => {
  it('keeps, lists newest first, and deletes', async () => {
    await saveNote(note('old', { at: '2026-10-01T00:00:00Z' }))
    await saveNote(note('new', { at: '2026-10-05T00:00:00Z' }))
    expect((await listNotes()).map((n) => n.id)).toEqual(['new', 'old'])
    await deleteNote('new')
    expect((await listNotes()).map((n) => n.id)).toEqual(['old'])
  })

  it('files items by subject, then grade, lowest first', () => {
    const groups = groupNotes([
      { subject: 'numeracy', grade: 3, id: 'a' },
      { subject: 'literacy', grade: 0, id: 'b' },
      { subject: 'numeracy', grade: 1, id: 'c' },
      { subject: 'numeracy', grade: 3, id: 'd' },
    ])
    expect(groups.map((g) => g.subject)).toEqual(['literacy', 'numeracy'])
    expect(groups[1].grades.map((g) => [g.grade, g.items.map((i) => i.id)])).toEqual([
      [1, ['c']],
      [3, ['a', 'd']],
    ])
  })
})

describe('sizes', () => {
  it('formats kilobytes and megabytes', () => {
    expect(formatSize(100)).toBe('1 KB')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(10 * 1024 ** 3)).toBe('10.0 GB')
  })
  it('reads the storage estimate when the browser offers one, and is null when it does not', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 5, quota: 100 }) } })
    expect(await storageUsage()).toEqual({ used: 5, quota: 100 })
    vi.stubGlobal('navigator', {})
    expect(await storageUsage()).toBeNull()
    vi.stubGlobal('navigator', { storage: { estimate: async () => Promise.reject(new Error('no')) } })
    expect(await storageUsage()).toBeNull()
  })
})
