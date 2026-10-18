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
  expect(db.version).toBe(2)
  expect([...db.objectStoreNames].sort()).toEqual(['outbox', 'pack_files', 'packs'])
  expect((await db.getAll('outbox')).map((e) => e.event_id)).toEqual(['e1'])
})
