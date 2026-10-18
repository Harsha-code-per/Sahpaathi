import { getDB, type StoredPack, type StoredPackFiles } from '../storage/db'
import { verifyPack } from './verify'

/** Ed25519 public key (raw, base64) that voice/ signs packs with. Public by design: it can only verify. */
const PACK_PUBLIC_KEY = import.meta.env.VITE_PACK_PUBLIC_KEY as string | undefined

/** Verifies and stores a pack. Importing the same episode again replaces it. Throws PackError on a bad pack. */
export async function importPack(file: Blob, publicKey = PACK_PUBLIC_KEY, now = new Date()): Promise<StoredPack> {
  const zip = new Uint8Array(await file.arrayBuffer())
  const { episode, audio } = await verifyPack(zip, publicKey)
  const pack: StoredPack = { id: episode.id, episode, imported_at: now.toISOString() }
  const tx = (await getDB()).transaction(['packs', 'pack_files'], 'readwrite')
  await Promise.all([tx.objectStore('packs').put(pack), tx.objectStore('pack_files').put({ id: pack.id, audio, zip }), tx.done])
  return pack
}

/** Newest first. */
export async function listPacks(): Promise<StoredPack[]> {
  const packs = await (await getDB()).getAll('packs')
  return packs.sort((a, b) => b.imported_at.localeCompare(a.imported_at))
}

export async function loadPackFiles(id: string): Promise<StoredPackFiles | undefined> {
  return (await getDB()).get('pack_files', id)
}

export async function deletePack(id: string) {
  const tx = (await getDB()).transaction(['packs', 'pack_files'], 'readwrite')
  await Promise.all([tx.objectStore('packs').delete(id), tx.objectStore('pack_files').delete(id), tx.done])
}
