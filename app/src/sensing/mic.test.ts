import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ChoralMic, FRAME_MS } from './mic'

// A fake room: `amplitude` is what the analyser "hears" right now (RMS of a constant signal).
let amplitude = 0.003
const stopTrack = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
  })
  vi.stubGlobal(
    'AudioContext',
    class {
      createAnalyser() {
        return { fftSize: 0, getFloatTimeDomainData: (buf: Float32Array) => buf.fill(amplitude) }
      }
      createMediaStreamSource() {
        return { connect() {} }
      }
      close() {
        return Promise.resolve()
      }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  stopTrack.mockClear()
})

async function openAndCalibrate() {
  const mic = new ChoralMic()
  expect(await mic.open()).toBe(true)
  amplitude = 0.003 // about -50 dBFS
  const done = mic.calibrate(2000)
  await vi.advanceTimersByTimeAsync(2000 + FRAME_MS)
  await done
  return mic
}

test('loud answers during a pause suggest most; the next checkpoint starts fresh', async () => {
  const mic = await openAndCalibrate()
  amplitude = 0.1 // about -20 dBFS, 30 dB over the room
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(3000)
  expect(mic.takeHint()?.tap).toBe('most')
  expect(mic.takeHint()).toBeNull() // nothing collected since
})

test('frames are only collected between startAnswer and stopAnswer', async () => {
  const mic = await openAndCalibrate()
  amplitude = 0.1
  await vi.advanceTimersByTimeAsync(3000) // the guide is talking: not listening
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(1000) // 10 frames: too few to judge
  mic.stopAnswer()
  await vi.advanceTimersByTimeAsync(5000) // guide again: ignored
  expect(mic.takeHint()).toBeNull()
  // takeHint reset the buffer, so listening again needs a full window of its own
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(2000)
  expect(mic.takeHint()?.tap).toBe('most')
})

test('resetAnswer drops frames from the previous segment, so they cannot colour the next hint', async () => {
  const mic = await openAndCalibrate()
  amplitude = 0.1 // segment 1's stretch lines: loud answers
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(3000)
  mic.resetAnswer() // segment 2's teach part starts
  expect(mic.takeHint()).toBeNull() // the buffer was emptied, nothing carried over
  amplitude = 0.003 // this time the children really are quiet
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(3000)
  expect(mic.takeHint()?.tap).toBe('few') // not pushed to "most" by segment 1's loud lines
})

test('a quiet reply to a calibrated room suggests few', async () => {
  const mic = await openAndCalibrate()
  amplitude = 0.003
  mic.startAnswer()
  await vi.advanceTimersByTimeAsync(3000)
  expect(mic.takeHint()?.tap).toBe('few')
})

test('declined permission returns false and close releases the mic', async () => {
  const mic = new ChoralMic()
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('denied'))
  expect(await mic.open()).toBe(false)
  const ok = await openAndCalibrate()
  ok.close()
  expect(stopTrack).toHaveBeenCalled()
})
