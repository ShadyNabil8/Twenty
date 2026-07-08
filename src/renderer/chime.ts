/**
 * Soft two-note chime (C5 → G5 sines with a gentle exponential decay),
 * synthesized with WebAudio so no audio asset needs to be shipped.
 */
export function playChime(volume = 0.14): void {
  const ctx = new AudioContext()
  const t0 = ctx.currentTime + 0.05
  const master = ctx.createGain()
  master.gain.value = volume
  master.connect(ctx.destination)

  const notes = [
    { freq: 523.25, at: 0 },
    { freq: 783.99, at: 0.22 },
  ]
  for (const { freq, at } of notes) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t0 + at)
    gain.gain.linearRampToValueAtTime(1, t0 + at + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.6)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t0 + at)
    osc.stop(t0 + at + 1.8)
  }
  window.setTimeout(() => void ctx.close(), 2_600)
}
