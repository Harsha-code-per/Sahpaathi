import type { Episode } from '../lib/types'
import counting from '../../../content/samples/g1-counting-hi-ta.json'
import shapes from '../../../content/samples/g1-shapes-ta-en.json'
import song from '../../../content/samples/g1-count-song-ta-en.json'
import addSeeds from '../../../content/samples/g2-add-seeds-ta-en.json'
import crow from '../../../content/samples/g2-thirsty-crow-ta-en.json'

// Bundled (so precached and playable with no pack, no login and no signal). `audio` maps line id -> URL, as in a
// pack manifest; empty here, so the player shows the text with timed pauses. Each lesson uses a different activity
// (pebble task, slate, pair work, song, story) so a teacher can try them all before real packs arrive.
type Sample = { episode: Episode; audio: Record<string, string> }
const sample = (e: unknown): Sample => ({ episode: e as Episode, audio: {} })

export const samplePack = sample(counting)
export const samplePacks: Sample[] = [samplePack, sample(shapes), sample(song), sample(addSeeds), sample(crow)]
