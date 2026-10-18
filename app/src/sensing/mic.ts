import { hintFromLevels, type Hint } from './choral'

// Microphone capture for the choral hint. Works offline (getUserMedia is local).
// Only a loudness number per frame leaves this file: audio is never recorded, stored or sent.

export const FRAME_MS = 100

export class ChoralMic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private ambient: number[] = []
  private answer: number[] = []
  private timer: number | undefined

  /** Asks for the mic. Returns false if the teacher declines or there is no mic. */
  async open(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch {
      return false
    }
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
    return true
  }

  /** Measures the room's own level for `ms`, so a noisy classroom is not mistaken for loud answers. */
  async calibrate(ms = 2000): Promise<void> {
    const levels: number[] = []
    for (let t = 0; t < ms; t += FRAME_MS) {
      await new Promise((r) => setTimeout(r, FRAME_MS))
      levels.push(this.level())
    }
    this.ambient = levels
  }

  /** Start collecting answer frames. Call only while the guide is silent and children answer. */
  startAnswer(): void {
    if (this.timer !== undefined || !this.analyser) return
    this.timer = window.setInterval(() => this.answer.push(this.level()), FRAME_MS)
  }

  stopAnswer(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** Suggests a tap from the answer frames gathered since the last call (null if unsure), then resets. */
  takeHint(): Hint {
    this.stopAnswer()
    const hint = hintFromLevels(this.ambient, this.answer)
    this.answer = []
    return hint
  }

  close(): void {
    this.stopAnswer()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.ctx = this.stream = this.analyser = null
  }

  private level(): number {
    if (!this.analyser) return -120
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
    return 20 * Math.log10(Math.max(rms, 1e-6))
  }
}
