import { hintFromLevels, type Hint } from './choral'

// Microphone capture for the choral hint. Works offline (getUserMedia is local).
// Only a loudness number per frame leaves this file: audio is never recorded, stored or sent.

const FRAME_MS = 100

export class ChoralMic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private ambient: number[] = []

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

  /** Call while the room is quiet or the guide is silent (e.g. right before the question). */
  async calibrate(ms = 2000): Promise<void> {
    this.ambient = await this.record(ms)
  }

  /** Listens for `ms` while children answer, then suggests a tap, or null if unsure. */
  async listen(ms: number): Promise<Hint> {
    return hintFromLevels(this.ambient, await this.record(ms))
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.ctx = this.stream = this.analyser = null
  }

  private async record(ms: number): Promise<number[]> {
    const analyser = this.analyser
    if (!analyser) return []
    const buf = new Float32Array(analyser.fftSize)
    const levels: number[] = []
    for (let t = 0; t < ms; t += FRAME_MS) {
      await new Promise((r) => setTimeout(r, FRAME_MS))
      analyser.getFloatTimeDomainData(buf)
      const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
      levels.push(20 * Math.log10(Math.max(rms, 1e-6)))
    }
    return levels
  }
}
