# Episode contract (v1, draft until end of Day 2)

Source of truth: [`backend/app/factory/schema.py`](../backend/app/factory/schema.py). TS mirror: [`app/src/lib/types.ts`](../app/src/lib/types.ts). Example: [`content/samples/g1-counting-hi-ta.json`](../content/samples/g1-counting-hi-ta.json).
Change all three in one PR.

## Shape
Exported episodes and packs always contain **every key** (written with `model_dump_json`), so `cue` is `null` rather than missing. That is why `types.ts` has no optional fields. Hand-written files must be normalised through the schema first.

```
Episode
  id, title, grade (1–5), subject (numeracy|literacy), nipun_lo
  home_lang, school_lang        ta | hi | or | sat | en
  district, duration_min (5–20), materials[]
  chalk_sketch_svg              < 50 KB, drawn on the blackboard before class
  segments[]
    id, title, activity         call_response | song | story | slate | pair_work | pebble_task
    teach[]                     always played
    checkpoint                  question the teacher answers with a tap
    easier[]  core[]  stretch[] follow-up per tap
    math_checks[]               {expr, answer}: every numeric task, verified in code
  analogy[]                     ~60 s "need a simpler analogy" story
  ivr_recap[]                   ~5 min recap for the absentee call
Line
  id (unique in episode, names the audio file), speaker (guide|child|song), lang, text,
  pause_after_sec (silence for children to answer), cue (shown to teacher, never spoken)
```

## Player rules
1. Play `teach`, then show `checkpoint` with three big buttons.
2. **Few got it → `easier`**, **Some → `core`**, **Most → `stretch`**. If there's no tap within **10 s**, play `core`.
3. The suggested button comes from the choral mic sensor (`app/src/sensing/`). It is a hint only; the teacher always decides.
4. The **Need a simpler analogy** button is available at any time. It plays `analogy`, then resumes.
5. Every tap goes to the sync queue as `{episode_id, segment_id, tap, auto: bool, at}`.

## Validation (guardrail tier 1)
- Unknown keys are rejected (`extra="forbid"`), so a drifting LLM output fails loudly.
- Line ids are unique across the whole episode.
- The SVG must start with `<svg` and be under 50 KB.
- Tier 1 rule checks in `factory/` add: arithmetic in `math_checks` is correct; Santali lines use only phrase-bank text.

## Pack (`.sahpaathi`, built by `voice/`)
One zip file:
```
manifest.json   { audio: { <line_id>: "audio/<line_id>.opus" },
                  sha256: { <path>: <hex> }, signature: <base64 Ed25519 over sha256 map> }
episode.json    the Episode (signed: listed in sha256)
audio/*.opus    16 kbps mono, loudness-normalised to −16 LUFS
sketch.svg
```
The signature covers the `sha256` map as JSON with sorted keys and no whitespace, and the map covers every file except `manifest.json`. The episode lives in `episode.json` (not inside the manifest) so it is signed too.
The player verifies the signature (WebCrypto Ed25519) before importing. A pack that fails verification is rejected with a clear message.
