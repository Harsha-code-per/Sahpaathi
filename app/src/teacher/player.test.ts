import { describe, expect, it } from 'vitest'
import type { Episode, Line, Tap } from '../lib/types'
import { advance, analogy, currentLine, start, tap, type Phase } from './player'
import { samplePack } from './samplePack'

const sample = samplePack.episode
const line = (id: string) => ({ id }) as Line
const seg = (id: string, parts: Partial<Record<'teach' | 'easier' | 'core' | 'stretch', string[]>>) => ({
  id,
  checkpoint: `${id}?`,
  teach: (parts.teach ?? []).map(line),
  easier: (parts.easier ?? []).map(line),
  core: (parts.core ?? []).map(line),
  stretch: (parts.stretch ?? []).map(line),
})
const episode = (segments: ReturnType<typeof seg>[], analogyIds: string[] = []) => ({ segments, analogy: analogyIds.map(line) }) as unknown as Episode

/** Plays to the end, answering every checkpoint with `choose`; returns the line ids heard. */
function play(ep: Episode, choose: Tap) {
  const heard: string[] = []
  let p = start(ep)
  for (let guard = 0; p.kind !== 'done'; guard++) {
    if (guard > 10_000) throw new Error('player did not finish')
    if (p.kind === 'checkpoint') p = tap(ep, p, choose)
    else {
      heard.push(currentLine(ep, p)!.id)
      p = advance(ep, p)
    }
  }
  return heard
}

const expected = (ep: Episode, part: 'easier' | 'core' | 'stretch') => ep.segments.flatMap((s) => [...s.teach, ...s[part]].map((l) => l.id))

describe('branching', () => {
  it.each([
    ['few', 'easier'],
    ['some', 'core'],
    ['most', 'stretch'],
  ] as const)('%s plays teach then %s in every segment of the sample', (t, part) => {
    expect(play(sample, t)).toEqual(expected(sample, part))
  })

  it('moves on to the next segment after a branch', () => {
    const ep = episode([seg('s1', { teach: ['t1'], core: ['c1'] }), seg('s2', { teach: ['t2'], core: ['c2'] })])
    expect(play(ep, 'some')).toEqual(['t1', 'c1', 't2', 'c2'])
  })

  it('skips empty parts', () => {
    const ep = episode([seg('s1', { core: ['c1'] }), seg('s2', { teach: ['t2'] })])
    expect(start(ep)).toEqual({ kind: 'checkpoint', seg: 0 })
    expect(play(ep, 'few')).toEqual(['t2'])
    expect(play(ep, 'some')).toEqual(['c1', 't2'])
  })

  it('finishes straight away when there are no segments', () => {
    expect(start(episode([]))).toEqual({ kind: 'done' })
  })

  it('ignores taps and advances that do not apply', () => {
    const ep = episode([seg('s1', { teach: ['t1'] })])
    const idle: Phase = { kind: 'idle' }
    const onLine = start(ep)
    expect(tap(ep, idle, 'most')).toBe(idle)
    expect(tap(ep, onLine, 'most')).toBe(onLine)
    expect(advance(ep, idle)).toBe(idle)
    expect(currentLine(ep, idle)).toBeNull()
  })
})

describe('analogy', () => {
  const ep = episode([seg('s1', { teach: ['t1', 't2'], core: ['c1'] })], ['a1', 'a2'])

  it('plays every analogy line, then restarts the interrupted line', () => {
    const onT2 = advance(ep, start(ep))
    let p = analogy(ep, onT2)
    expect(currentLine(ep, p)?.id).toBe('a1')
    p = advance(ep, p)
    expect(currentLine(ep, p)?.id).toBe('a2')
    expect(advance(ep, p)).toBe(onT2)
  })

  it('returns to the checkpoint, where taps still work', () => {
    const checkpoint = advance(ep, advance(ep, start(ep)))
    expect(checkpoint.kind).toBe('checkpoint')
    const back = advance(ep, advance(ep, analogy(ep, checkpoint)))
    expect(back).toBe(checkpoint)
    expect(currentLine(ep, tap(ep, back, 'some'))?.id).toBe('c1')
  })

  it('is unavailable before, after, during an analogy, or when the episode has none', () => {
    const idle: Phase = { kind: 'idle' }
    const done: Phase = { kind: 'done' }
    const playing = analogy(ep, start(ep))
    expect(analogy(ep, idle)).toBe(idle)
    expect(analogy(ep, done)).toBe(done)
    expect(analogy(ep, playing)).toBe(playing)
    const none = episode([seg('s1', { teach: ['t1'] })])
    const p = start(none)
    expect(analogy(none, p)).toBe(p)
  })
})
