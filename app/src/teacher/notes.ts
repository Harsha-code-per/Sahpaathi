import { getDB, type NoteRecord } from '../storage/db'

// The teacher's shelf of books and notes: PDFs she adds (an NCERT chapter she downloaded, a worksheet, her own
// notes), kept on the phone so they open with no signal. Nothing here is sent anywhere.

export const MAX_NOTE_BYTES = 25 * 1024 * 1024

/** Why this file cannot go on the shelf, or null when it can. */
export function noteProblem(file: { name: string; type: string; size: number }): 'type' | 'size' | null {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'type'
  return file.size > MAX_NOTE_BYTES ? 'size' : null
}

export const titleFromName = (name: string) =>
  name
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Notes'

export async function saveNote(n: NoteRecord) {
  await (await getDB()).put('notes', n)
}

export async function listNotes(): Promise<NoteRecord[]> {
  return (await (await getDB()).getAll('notes')).sort((a, b) => b.at.localeCompare(a.at))
}

export async function deleteNote(id: string) {
  await (await getDB()).delete('notes', id)
}

/** Notes grouped for the shelf: by subject, then grade (0 = all grades), each list newest first. */
export function groupNotes<T extends { subject: string; grade: number }>(items: T[]): { subject: string; grades: { grade: number; items: T[] }[] }[] {
  const subjects = [...new Set(items.map((n) => n.subject))].sort()
  return subjects.map((subject) => {
    const inSubject = items.filter((n) => n.subject === subject)
    const grades = [...new Set(inSubject.map((n) => n.grade))].sort((a, b) => a - b)
    return { subject, grades: grades.map((grade) => ({ grade, items: inSubject.filter((n) => n.grade === grade) })) }
  })
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** How much of the phone's storage this app uses, when the browser says; null otherwise. */
export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e?.usage !== undefined && e.quota ? { used: e.usage, quota: e.quota } : null
  } catch {
    return null
  }
}
