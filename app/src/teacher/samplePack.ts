import type { Episode } from '../lib/types'
import sample from '../../../content/samples/g1-counting-hi-ta.json'

// Bundled (so precached) until pack import + IndexedDB lands. `audio` maps line id -> URL, as in a pack manifest;
// empty until voice/ ships packs, so the player falls back to on-screen text with timed pauses.
export const samplePack: { episode: Episode; audio: Record<string, string> } = {
  episode: sample as unknown as Episode,
  audio: {},
}
