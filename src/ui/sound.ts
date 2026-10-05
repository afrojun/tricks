/** Small synthesised sound effects. No audio files. */
export type Sound = 'cardPlay' | 'deal' | 'trickWin' | 'yourTurn' | 'call' | 'challenge' | 'ball' | 'pip' | 'gameOver'

const MUTE_KEY = 'tricks-muted'
let context: AudioContext | null = null

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

function audio(): AudioContext | null {
  if (isMuted() || typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.2, delay = 0) {
  const ctx = audio()
  if (!ctx) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.01, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration)
}

function noise(duration: number, volume = 0.2) {
  const ctx = audio()
  if (!ctx) return
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = 1000
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start()
}

const SOUNDS: Record<Sound, () => void> = {
  cardPlay: () => {
    noise(0.08, 0.22)
    tone(200, 0.05, 'square', 0.08)
  },
  deal: () => noise(0.05, 0.14),
  trickWin: () => [440, 554, 659].forEach((f, i) => tone(f, 0.12, 'sine', 0.2, i * 0.08)),
  yourTurn: () => tone(880, 0.12, 'sine', 0.14),
  call: () => tone(330, 0.14, 'triangle', 0.18),
  challenge: () => [220, 196, 165].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.14, i * 0.12)),
  pip: () => tone(784, 0.14, 'triangle', 0.2),
  ball: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, i * 0.09)),
  gameOver: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.14)),
}

export function playSound(sound: Sound): void {
  try {
    SOUNDS[sound]()
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}
