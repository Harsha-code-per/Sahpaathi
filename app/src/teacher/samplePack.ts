import type { Episode } from '../lib/types'
import counting from '../../../content/samples/g1-counting-hi-ta.json'
import shapes from '../../../content/samples/g1-shapes-ta-en.json'
import song from '../../../content/samples/g1-count-song-ta-en.json'
import addSeeds from '../../../content/samples/g2-add-seeds-ta-en.json'
import crow from '../../../content/samples/g2-thirsty-crow-ta-en.json'
import voices from '../../../content/samples/audio.json'

// Bundled (so precached and playable with no pack, no login and no signal). `audio` maps line id -> URL, as in a
// pack manifest: real Sarvam voices in app/public/audio, encoded like a pack (opus 16 kbps, -16 LUFS), and listed
// in audio.json. Each lesson uses a different activity (pebble task, slate, pair work, song, story) so a teacher
// can try them all before real packs arrive.
// ponytail: about 550 KB of precache for five lessons; drop to one lesson if a first visit on 2G proves too slow.
type Sample = { episode: Episode; audio: Record<string, string> }
const sample = (e: { id: string }): Sample => ({ episode: e as unknown as Episode, audio: (voices as Record<string, Record<string, string>>)[e.id] ?? {} })

export const samplePack = sample(counting)
export const samplePacks: Sample[] = [samplePack, sample(shapes), sample(song), sample(addSeeds), sample(crow)]
