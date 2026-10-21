import { describe, expect, it } from 'vitest'
import { countFillers, faceDelta, faceFromBlendshapes, makeBaseline, NoiseTracker, poseDelta, poseFromLandmarks, type Point, type RawFace } from './features'

const shapes = (o: Record<string, number>) => Object.entries(o).map(([categoryName, score]) => ({ categoryName, score }))
/** A face looking straight at the screen: nose halfway between the face edges, level with the middle. */
const frontal = (): Point[] => {
  const lm: Point[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }))
  lm[234] = { x: 0.3, y: 0.5 }
  lm[454] = { x: 0.7, y: 0.5 }
  lm[1] = { x: 0.5, y: 0.5 }
  lm[10] = { x: 0.5, y: 0.3 }
  lm[152] = { x: 0.5, y: 0.7 }
  return lm
}

describe('faceFromBlendshapes', () => {
  it('averages the left and right blendshapes of each expression', () => {
    const f = faceFromBlendshapes(shapes({ browDownLeft: 0.4, browDownRight: 0.2, eyeBlinkLeft: 1, eyeBlinkRight: 0, jawOpen: 0.5, browInnerUp: 0.3 }), frontal())
    expect(f.brow_down).toBeCloseTo(0.3)
    expect(f.eye_closure).toBeCloseTo(0.5)
    expect(f.jaw_open).toBe(0.5)
    expect(f.brow_inner_up).toBe(0.3)
  })

  it('treats missing blendshapes as zero', () => {
    const f = faceFromBlendshapes([], frontal())
    const { head_down, ...rest } = f // the nod ratio is 0.5 when level; everything else is zero
    expect(head_down).toBeCloseTo(0.5)
    Object.values(rest).forEach((v) => expect(v).toBeCloseTo(0))
  })

  it('reads a turned head as looking away, and a frontal one as not', () => {
    const turned = frontal()
    turned[1] = { x: 0.62, y: 0.5 } // the nose has moved toward one edge
    expect(faceFromBlendshapes([], turned).gaze_away).toBeGreaterThan(0.3)
    expect(faceFromBlendshapes([], frontal()).gaze_away).toBeCloseTo(0)
  })

  it('reads eyes looking out to the side as looking away', () => {
    expect(faceFromBlendshapes(shapes({ eyeLookOutLeft: 0.8, eyeLookOutRight: 0.8 }), frontal()).gaze_away).toBeCloseTo(0.8)
  })
})

describe('baseline: each person against their own calm', () => {
  const calm: RawFace = { brow_down: 0.1, brow_inner_up: 0, eye_squint: 0.05, mouth_frown: 0, mouth_press: 0.02, eye_closure: 0.1, jaw_open: 0, gaze_away: 0.05, head_down: 0.5 }

  it('uses the median of the calm seconds, so one blink does not move it', () => {
    const base = makeBaseline([calm, calm, { ...calm, brow_down: 0.9 }, calm, calm], [])
    expect(base.face?.brow_down).toBeCloseTo(0.1)
  })

  it('reports only what is above the learner’s own usual, and never below zero', () => {
    const d = faceDelta({ ...calm, brow_down: 0.4, eye_closure: 0.0 }, calm)
    expect(d.brow_down).toBeCloseTo(0.3)
    expect(d.eye_closure).toBe(0)
    expect(faceDelta(calm, calm).brow_down).toBe(0)
  })

  it('scales a nod up, since the ratio moves only a little', () => {
    expect(faceDelta({ ...calm, head_down: 0.6 }, calm).head_down).toBeCloseTo(0.3)
  })

  it('gives a person with a naturally lowered brow no head start towards “confused”', () => {
    const lowBrow = { ...calm, brow_down: 0.35 }
    expect(faceDelta(lowBrow, lowBrow).brow_down).toBe(0)
  })
})

describe('pose', () => {
  const upright = (): Point[] => {
    const p: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
    p[0] = { x: 0.5, y: 0.3, visibility: 1 } // nose
    p[11] = { x: 0.35, y: 0.6, visibility: 1 } // shoulders, 0.3 apart
    p[12] = { x: 0.65, y: 0.6, visibility: 1 }
    p[15] = { x: 0.2, y: 0.9, visibility: 0.9 } // wrists far from the face
    p[16] = { x: 0.8, y: 0.9, visibility: 0.9 }
    return p
  }

  it('measures the head above the shoulders in shoulder widths', () => {
    const raw = poseFromLandmarks(upright())!
    expect(raw.headRise).toBeCloseTo(1) // 0.3 above, shoulders 0.3 wide
    expect(raw.shoulderWidth).toBeCloseTo(0.3)
  })

  it('gives up when the shoulders are not visible', () => {
    const p = upright()
    p[11].visibility = 0.2
    expect(poseFromLandmarks(p)).toBeNull()
  })

  it('notices slouching, leaning away and a hand at the face, each against the starting posture', () => {
    const base = poseFromLandmarks(upright())!
    expect(poseDelta(base, base)).toEqual({ slouch: 0, lean_back: 0, hand_to_face: 0 })
    const slumped = upright()
    slumped[0].y = 0.5 // the head has sunk toward the shoulders
    expect(poseDelta(poseFromLandmarks(slumped)!, base).slouch).toBeGreaterThan(0.4)
    const away = poseDelta({ ...base, shoulderWidth: base.shoulderWidth * 0.8 }, base)
    expect(away.lean_back).toBeGreaterThan(0.3)
    const hand = upright()
    hand[15] = { x: 0.52, y: 0.34, visibility: 0.9 } // a wrist beside the nose
    expect(poseDelta(poseFromLandmarks(hand)!, base).hand_to_face).toBeGreaterThan(0.8)
  })

  it('ignores a wrist the model is not sure about', () => {
    const p = upright()
    p[15] = { x: 0.5, y: 0.31, visibility: 0.1 }
    expect(poseFromLandmarks(p)!.handDist).toBeGreaterThan(1)
  })
})

describe('NoiseTracker', () => {
  it('measures sound against the room’s own quiet level', () => {
    const t = new NoiseTracker()
    for (let i = 0; i < 50; i++) t.addQuiet(0.1)
    expect(t.excess(0.1)).toBe(0)
    expect(t.excess(0.35)).toBeCloseTo(1)
    expect(t.excess(0.2)).toBeCloseTo(0.4)
  })

  it('learns a noisy room’s floor, so a constant fan is not a disturbance', () => {
    const t = new NoiseTracker()
    for (let i = 0; i < 50; i++) t.addQuiet(0.3)
    expect(t.excess(0.3)).toBe(0)
  })

  it('forgets old readings', () => {
    const t = new NoiseTracker()
    for (let i = 0; i < 200; i++) t.addQuiet(0.5)
    for (let i = 0; i < 130; i++) t.addQuiet(0.05)
    expect(t.floor).toBeCloseTo(0.05)
  })
})

describe('countFillers', () => {
  it('counts hesitation sounds', () => {
    expect(countFillers('umm, hmm, I think uh it is 5')).toBe(3)
    expect(countFillers('The answer is five')).toBe(0)
  })
})
