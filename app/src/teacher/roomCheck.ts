// Listens to the room for a few seconds and returns its average level in dBFS, or null when the mic is
// unavailable or declined. Nothing is recorded or sent: only a running loudness number exists, and the
// stream is closed straight after.
export async function measureRoomDb(ms = 3000): Promise<number | null> {
  let stream: MediaStream | undefined
  let ctx: AudioContext | undefined
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false } })
    ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let sum = 0
    let n = 0
    for (let t = 0; t < ms; t += 100) {
      await new Promise((r) => setTimeout(r, 100))
      analyser.getFloatTimeDomainData(buf)
      sum += buf.reduce((a, v) => a + v * v, 0) / buf.length
      n++
    }
    return 10 * Math.log10(Math.max(sum / n, 1e-10))
  } catch {
    return null
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
    ctx?.close().catch(() => {})
  }
}
