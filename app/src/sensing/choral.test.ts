import { expect, test } from 'vitest'
import { hintFromLevels, MIN_FRAMES } from './choral'

const frames = (db: number, n = 30): number[] => Array(n).fill(db)
const AMBIENT = frames(-50)

test('whole class answering loudly suggests most', () => {
  expect(hintFromLevels(AMBIENT, frames(-30))?.tap).toBe('most')
})

test('a few quiet voices suggest few', () => {
  const answer = [...frames(-50, 24), ...frames(-42, 6)]
  expect(hintFromLevels(AMBIENT, answer)?.tap).toBe('few')
})

test('half the answer window with speech suggests some', () => {
  const answer = [...frames(-50, 15), ...frames(-36, 15)]
  expect(hintFromLevels(AMBIENT, answer)?.tap).toBe('some')
})

test('silence after the question is few, not a crash', () => {
  expect(hintFromLevels(AMBIENT, frames(-50))).toEqual({ tap: 'few', score: 0 })
})

test('too little data gives no hint', () => {
  expect(hintFromLevels(AMBIENT, frames(-30, MIN_FRAMES - 1))).toBeNull()
  expect(hintFromLevels([], frames(-30))).toBeNull()
})

test('a noisy classroom is judged against its own ambient level', () => {
  const noisy = frames(-30)
  expect(hintFromLevels(noisy, frames(-30))?.tap).toBe('few') // no louder than the room
  expect(hintFromLevels(noisy, frames(-12))?.tap).toBe('most')
})
