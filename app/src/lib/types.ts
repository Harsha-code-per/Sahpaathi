// Hand mirror of backend/app/factory/schema.py (docs/EPISODE_SCHEMA.md). Change all three in one PR.

export type Lang = 'ta' | 'hi' | 'or' | 'sat' | 'en'

export interface Line {
  id: string
  speaker: 'guide' | 'child' | 'song'
  lang: Lang
  text: string
  pause_after_sec: number
  cue: string | null
}

export interface MathCheck {
  expr: string
  answer: number
}

/** Teacher tap after a segment. Few -> easier, Some -> core, Most -> stretch; no tap in 10 s -> core. */
export type Tap = 'few' | 'some' | 'most'

export interface Segment {
  id: string
  title: string
  activity: 'call_response' | 'song' | 'story' | 'slate' | 'pair_work' | 'pebble_task'
  teach: Line[]
  checkpoint: string
  easier: Line[]
  core: Line[]
  stretch: Line[]
  math_checks: MathCheck[]
}

export interface Episode {
  schema_version: 1
  id: string
  title: string
  grade: number
  subject: 'numeracy' | 'literacy'
  nipun_lo: string
  home_lang: Lang
  school_lang: Lang
  district: string
  duration_min: number
  materials: string[]
  chalk_sketch_svg: string
  segments: Segment[]
  analogy: Line[]
  ivr_recap: Line[]
}
