/** A short three-note chime to settle a class, made with WebAudio so it works with no file and no signal. */
export function ringBell() {
  try {
    const ctx = new AudioContext()
    const t0 = ctx.currentTime
    ;[784, 988, 1175].forEach((hz, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz
      const at = t0 + i * 0.22
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 1.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 2500)
  } catch {
    /* no audio output: the teacher can still clap */
  }
}
