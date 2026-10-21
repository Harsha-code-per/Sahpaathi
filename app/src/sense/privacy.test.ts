import { describe, expect, it } from 'vitest'

/**
 * The promise to learners: the camera and microphone are only read, never recorded, and nothing is kept
 * after the page. These tests read the source of everything in src/sense and fail if someone adds a
 * way to record, save, or ship a picture or a sound. If one fails, the change needs a privacy review.
 */
const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const FORBIDDEN: [RegExp, string][] = [
  [/MediaRecorder/, 'records audio or video'],
  [/captureStream|ImageCapture|createImageBitmap/, 'grabs a picture from the camera'],
  [/toDataURL|toBlob|getImageData|drawImage/, 'turns a frame into an image'],
  [/localStorage|sessionStorage|indexedDB|IDBDatabase|caches\./, 'keeps something after the page'],
  [/sendBeacon|WebSocket|RTCPeerConnection/, 'sends data by a channel other than the one reviewed'],
  [/document\.cookie/, 'writes a cookie'],
  [/getChannelData|AudioWorklet|ScriptProcessor|createMediaStreamDestination/, 'reads raw audio samples out of the analyser'],
]

describe('the perception code does not record, save or ship pictures or sound', () => {
  it('scans the sense sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(4)
  })

  for (const [file, text] of Object.entries(sources)) {
    it(`${file} has no recording or storage code`, () => {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') // comments may talk about it
      for (const [pattern, why] of FORBIDDEN) expect(code, `${file}: ${why}`).not.toMatch(pattern)
    })
  }

  it('sends nothing but the numbers, in one place only', () => {
    const calls = Object.entries(sources).flatMap(([file, text]) => [...text.matchAll(/\bfetch\(/g)].map(() => file))
    expect(calls).toEqual(['./useSense.ts']) // exactly one network call in this whole folder
    expect(sources['./useSense.ts']).toMatch(/\/tutor\/sense/)
  })

  it('never puts a video or audio object into the request body', () => {
    const body = sources['./useSense.ts'].match(/body: JSON\.stringify\(([^)]*\)?[^)]*)\)/)?.[1] ?? ''
    expect(body).toMatch(/samples: window/)
    expect(body).not.toMatch(/media|video|stream|audio\./i)
  })
})
