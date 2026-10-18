// Run: node --test tests/choral.test.mjs   (Node 24 strips TypeScript types, no extra dependencies)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hintFromLevels, MIN_FRAMES } from '../src/sensing/choral.ts'

const frames = (db, n = 30) => Array(n).fill(db)
const AMBIENT = frames(-50)

test('whole class answering loudly suggests most', () => {
  const h = hintFromLevels(AMBIENT, frames(-30))
  assert.equal(h.tap, 'most')
})

test('a few quiet voices suggest few', () => {
  const answer = [...frames(-50, 24), ...frames(-42, 6)]
  assert.equal(hintFromLevels(AMBIENT, answer).tap, 'few')
})

test('half the answer window with speech suggests some', () => {
  const answer = [...frames(-50, 15), ...frames(-36, 15)]
  assert.equal(hintFromLevels(AMBIENT, answer).tap, 'some')
})

test('silence after the question is few, not a crash', () => {
  assert.deepEqual(hintFromLevels(AMBIENT, frames(-50)), { tap: 'few', score: 0 })
})

test('too little data gives no hint', () => {
  assert.equal(hintFromLevels(AMBIENT, frames(-30, MIN_FRAMES - 1)), null)
  assert.equal(hintFromLevels([], frames(-30)), null)
})

test('a noisy classroom is judged against its own ambient level', () => {
  const noisy = frames(-30)
  assert.equal(hintFromLevels(noisy, frames(-30)).tap, 'few') // no louder than the room
  assert.equal(hintFromLevels(noisy, frames(-12)).tap, 'most')
})
