import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, expect, it } from 'vitest'
import { closeDB, getDB } from './db'

beforeEach(async () => {
  await closeDB()
  globalThis.indexedDB = new IDBFactory()
})

it('upgrades a version 1 database without losing queued taps', async () => {
  // A phone running the previous release: only the outbox, with one tap waiting.
  const v1 = await openDB('sahpaathi', 1, {
    upgrade: (d) => d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at'),
  })
  await v1.add('outbox', { kind: 'tap', event_id: 'e1', episode_id: 'ep', segment_id: 's1', tap: 'few', auto: false, at: '2026-10-19T04:00:00.000Z' })
  v1.close()

  const db = await getDB()
  expect(db.version).toBe(5)
  expect([...db.objectStoreNames].sort()).toEqual(['classroom', 'history', 'outbox', 'pack_files', 'packs', 'recordings'])
  expect((await db.getAll('outbox')).map((e) => e.event_id)).toEqual(['e1'])
})

it('upgrades a version 2 database, keeping the queue and adding the classroom store', async () => {
  // A phone running the previous release: taps, packs and files, but no attendance setup yet.
  const v2 = await openDB('sahpaathi', 2, {
    upgrade: (d) => {
      d.createObjectStore('outbox', { keyPath: 'event_id' }).createIndex('at', 'at')
      d.createObjectStore('packs', { keyPath: 'id' })
      d.createObjectStore('pack_files', { keyPath: 'id' })
    },
  })
  await v2.add('outbox', { kind: 'tap', event_id: 'e2', episode_id: 'ep', segment_id: 's1', tap: 'some', auto: false, at: '2026-10-19T04:00:00.000Z' })
  v2.close()

  const db = await getDB()
  expect(db.version).toBe(5)
  expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['classroom', 'history']))
  expect((await db.getAll('outbox')).map((e) => e.event_id)).toEqual(['e2'])
  expect(await db.get('classroom', 'current')).toBeUndefined()
})
