/**
 * From raw landmarks to the small numbers the perception agents read. Everything here runs on the
 * learner's device; only these numbers are ever sent anywhere (no image, no audio).
 *
 * Every measurement is turned into "how far from this person's own calm": the first few seconds set a
 * baseline, and later values are the difference above it. That keeps the agents fair to faces and
 * seats that look different from whatever the thresholds were imagined with.
 */

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const avg = (...n: number[]) => n.reduce((a, b) => a + b, 0) / n.length
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0
}

/** Absolute face measurements, 0 to 1 (blendshape scores, and head turn / nod from landmarks). */
export interface RawFace {
  brow_down: number
  brow_inner_up: number
  eye_squint: number
  mouth_frown: number
  mouth_press: number
  eye_closure: number
  jaw_open: number
  gaze_away: number
  head_down: number
}
/** Absolute body measurements. `headRise` is the nose above the shoulder line, in shoulder widths. */
export interface RawPose {
  headRise: number
  shoulderWidth: number
  handDist: number // nearest wrist to the nose, in shoulder widths; large when no hand is near
}
export interface Point {
  x: number
  y: number
  visibility?: number
}

/** MediaPipe returns blendshapes as `{categoryName, score}` pairs. */
export function faceFromBlendshapes(shapes: { categoryName: string; score: number }[], landmarks: Point[]): RawFace {
  const b = new Map(shapes.map((s) => [s.categoryName, s.score]))
  const g = (name: string) => b.get(name) ?? 0
  const pair = (name: string) => avg(g(`${name}Left`), g(`${name}Right`))
  // Head turn: where the nose tip sits between the two face edges. 0.5 is facing the screen.
  const left = landmarks[234],
    right = landmarks[454],
    nose = landmarks[1],
    top = landmarks[10],
    chin = landmarks[152]
  const yaw = left && right && nose ? Math.abs((nose.x - left.x) / (right.x - left.x || 1) - 0.5) * 2 : 0
  const pitch = top && chin && nose ? (nose.y - top.y) / (chin.y - top.y || 1) : 0.5
  return {
    brow_down: pair('browDown'),
    brow_inner_up: g('browInnerUp'),
    eye_squint: pair('eyeSquint'),
    mouth_frown: pair('mouthFrown'),
    mouth_press: pair('mouthPress'),
    eye_closure: pair('eyeBlink'),
    jaw_open: g('jawOpen'),
    gaze_away: clamp(Math.max(yaw * 1.5, avg(g('eyeLookOutLeft'), g('eyeLookOutRight')))),
    head_down: pitch, // an absolute nod ratio; the baseline turns it into "more than usual"
  }
}

export function poseFromLandmarks(p: Point[]): RawPose | null {
  const nose = p[0],
    ls = p[11],
    rs = p[12]
  if (!nose || !ls || !rs || (ls.visibility ?? 1) < 0.5 || (rs.visibility ?? 1) < 0.5) return null
  const width = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1e-6
  const shoulderY = (ls.y + rs.y) / 2
  const wrists = [p[15], p[16]].filter((w) => w && (w.visibility ?? 1) > 0.5)
  const handDist = wrists.length ? Math.min(...wrists.map((w) => Math.hypot(w.x - nose.x, w.y - nose.y) / width)) : 9
  return { headRise: (shoulderY - nose.y) / width, shoulderWidth: width, handDist }
}

export interface Baseline {
  face: RawFace | null
  pose: RawPose | null
}

export function makeBaseline(faces: RawFace[], poses: RawPose[]): Baseline {
  const face = faces.length
    ? (Object.fromEntries((Object.keys(faces[0]) as (keyof RawFace)[]).map((k) => [k, median(faces.map((f) => f[k]))])) as unknown as RawFace)
    : null
  const pose = poses.length ? { headRise: median(poses.map((p) => p.headRise)), shoulderWidth: median(poses.map((p) => p.shoulderWidth)), handDist: 9 } : null
  return { face, pose }
}

/** What the server's Face model wants: each measure above the learner's own baseline, scaled to about 0 to 1. */
export function faceDelta(raw: RawFace, base: RawFace | null) {
  const up = (k: keyof RawFace, scale = 1) => clamp((raw[k] - (base?.[k] ?? 0)) * scale)
  return {
    brow_down: up('brow_down'),
    brow_inner_up: up('brow_inner_up'),
    eye_squint: up('eye_squint'),
    mouth_frown: up('mouth_frown'),
    mouth_press: up('mouth_press'),
    eye_closure: up('eye_closure'),
    jaw_open: up('jaw_open'),
    gaze_away: up('gaze_away'),
    head_down: up('head_down', 3), // a nod ratio moves only a little, so scale it up
  }
}

export function poseDelta(raw: RawPose, base: RawPose | null) {
  const slouch = base ? clamp((base.headRise - raw.headRise) * 1.5) : 0 // the head sinks toward the shoulders
  const lean = base ? clamp((1 - raw.shoulderWidth / base.shoulderWidth) * 3) : 0 // shoulders look narrower
  return { slouch, lean_back: lean, hand_to_face: clamp(1 - raw.handDist / 0.9) }
}

/** A loudness (0 to 1) and the quiet floor it is measured against. */
export class NoiseTracker {
  private recent: number[] = []
  /** Feed one loudness reading taken while nobody is speaking. */
  addQuiet(level: number) {
    this.recent.push(level)
    if (this.recent.length > 120) this.recent.shift() // about the last 30 seconds at 4 readings a second
  }
  get floor() {
    if (!this.recent.length) return 0
    const s = [...this.recent].sort((a, b) => a - b)
    return s[Math.floor(s.length * 0.2)] // the quiet end: the room's own hum
  }
  /** How far above the room's usual sound this reading is, 0 to 1. */
  excess(level: number) {
    return clamp((level - this.floor) * 4)
  }
}

/** Counts "umm", "hmm", "uh" in what was said, in a few languages' common fillers. */
export function countFillers(text: string): number {
  return (text.toLowerCase().match(/\b(u+m+|h+m+|u+h+|er+|a+h+)\b|ம்+|हम्|उम/g) ?? []).length
}
