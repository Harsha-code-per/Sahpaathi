import { getDB, isCode, MAX_ABSENT, type ClassroomRecord } from '../storage/db'

// Which classroom this phone belongs to. One add-only record keyed 'current'; saving again replaces it.
// Roll codes are opaque on purpose (POST /sync contract, PR #32): letters, digits and hyphen, never names.

/** The saved classroom, or null before setup. */
export async function getClassroom(): Promise<ClassroomRecord | null> {
  const record = await (await getDB()).get('classroom', 'current')
  return record ?? null
}

/** Validates the setup and stores it; anything the teacher typed by mistake fails here, before the grid. */
export async function saveClassroom(c: { classroom_id: string; rolls: string[] }): Promise<ClassroomRecord> {
  if (!isCode(c.classroom_id)) throw new Error('The classroom code can only use letters, digits and hyphen, starting with a letter or digit, up to 40 characters, like G2-A.')
  if (c.rolls.length === 0) throw new Error('Add roll numbers, like 1-30 or 4, 7, 12.')
  const bad = c.rolls.find((r) => !isCode(r))
  if (bad) throw new Error(`"${bad}" is not a roll number: use codes like 17 or R4, no names.`)
  const record: ClassroomRecord = { id: 'current', classroom_id: c.classroom_id, rolls: c.rolls }
  await (await getDB()).put('classroom', record)
  return record
}

/** The server takes at most 100 absent rolls per save, so a class can't list more; it also keeps the grid tappable. */
const MAX_ROLLS = MAX_ABSENT

const TOO_MANY = `That list is over ${MAX_ROLLS} rolls. A class has fewer, so please check the range.`

/** Turns the teacher's roll list ("1-30" or "1,3,7") into roll codes; throws in plain words on a typo. */
export function parseRolls(text: string): string[] {
  const rolls = new Set<string>()
  for (const part of text.split(',')) {
    const entry = part.trim()
    if (entry === '') continue
    const range = /^(\d+)-(\d+)$/.exec(entry)
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      if (from > to) throw new Error(`"${entry}" counts backwards. Ranges go low to high, like 1-30.`)
      // Checked before expanding, so a typo like 1-30000000 fails at once instead of freezing the phone.
      if (rolls.size + (to - from + 1) > MAX_ROLLS) throw new Error(TOO_MANY)
      for (let n = from; n <= to; n++) rolls.add(String(n))
    } else {
      if (!isCode(entry)) throw new Error(`"${entry}" is not a roll number. Use numbers or roll codes, and no names.`)
      rolls.add(entry)
    }
  }
  if (rolls.size === 0) throw new Error('Add roll numbers, like 1-30 or 4, 7, 12.')
  if (rolls.size > MAX_ROLLS) throw new Error(TOO_MANY)
  return [...rolls]
}

/** Compresses consecutive numbers so the edit box shows "1-3, 7" instead of thirty items. */
export function rollsAsText(rolls: string[]): string {
  const isNumber = (r: string) => /^\d+$/.test(r)
  const nums = [...new Set(rolls.filter(isNumber).map(Number))].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < nums.length; ) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    parts.push(i === j ? String(nums[i]) : `${nums[i]}-${nums[j]}`)
    i = j + 1
  }
  for (const r of rolls) if (!isNumber(r)) parts.push(r)
  return parts.join(', ')
}
