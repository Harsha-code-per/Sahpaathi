import { BASE } from '../studio/api'

export type Lang = 'en' | 'hi' | 'ta' | 'or'
export type Style = 'normal' | 'simple'
export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/** The tutor is open to anyone (no login); the server caps what it can spend per day. */
async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}/tutor/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return res
  const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => undefined)
  throw new Error(typeof detail === 'string' ? detail : 'The teacher could not answer. Try again.')
}

export async function chat(messages: Turn[], language: Lang, style: Style, topic: string): Promise<string> {
  const res = await post('chat', { messages, language, style, topic })
  return ((await res.json()) as { reply: string }).reply
}

/** Server voice (Sarvam) as a playable URL, or null when the server has none: the caller then speaks it itself. */
export async function speakUrl(text: string, language: Lang): Promise<string | null> {
  try {
    const res = await post('speak', { text: text.slice(0, 600), language })
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}
