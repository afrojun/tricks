/**
 * The table's sounds: CC0 recordings in `public/sounds/` (their sources in `SOURCES.txt` there),
 * each decoded once and played through Web Audio a few percent off pitch, so no two plays are the
 * same. A sound is a nicety: no audio, a missing file or a bad decode is silence, never an error.
 */
export type Sound =
  | 'deal'
  | 'card'
  | 'slam'
  | 'turn'
  | 'sweep'
  | 'sweepTheirs'
  | 'call'
  | 'big'
  | 'jodhi'
  | 'challenge'
  | 'caught'
  | 'fair'
  | 'ball'
  | 'gameWon'
  | 'tap'

/** One recording in a sound: a file in `public/sounds/` (one of several, at random), how loud, ms after the sound starts, and where it is faded out. */
interface Part {
  file: string | readonly string[]
  volume: number
  at?: number
  cut?: number
}

interface Recipe {
  parts: Part[]
  /** A `navigator.vibrate` pattern played with it. */
  haptic?: number | number[]
}

const KNOCK = 'fs-knock-table'

const SOUNDS: Record<Sound, Recipe> = {
  deal: { parts: [{ file: 'card-shuffle', volume: 0.7, cut: 1300 }] },
  card: { parts: [{ file: 'card-place-2', volume: 0.8 }] },
  slam: { parts: [{ file: 'card-place-3', volume: 1 }, { file: 'impactWood_light_000', volume: 0.7 }], haptic: 40 },
  turn: { parts: [{ file: 'impactWood_light_000', volume: 0.8 }, { file: 'impactWood_light_001', volume: 0.8, at: 150 }], haptic: [30, 90, 30] },
  sweep: { parts: [{ file: 'card-shove-2', volume: 0.8 }] },
  sweepTheirs: { parts: [{ file: 'card-shove-2', volume: 0.35 }] },
  call: { parts: [{ file: KNOCK, volume: 0.9 }] },
  big: { parts: [{ file: 'fs-slam-desk', volume: 0.7 }], haptic: 60 },
  jodhi: { parts: [{ file: 'card-fan-1', volume: 0.8 }] },
  challenge: { parts: [0, 280, 560].map((at) => ({ file: KNOCK, volume: 1, at })) },
  caught: { parts: [{ file: 'fs-stamp-1', volume: 1 }], haptic: 80 },
  fair: { parts: [{ file: 'fs-bell-desk', volume: 0.8, cut: 1400 }] },
  ball: { parts: [{ file: ['fs-chip-0', 'fs-chip-1', 'fs-chip-2'], volume: 0.9 }], haptic: 15 },
  gameWon: { parts: [{ file: 'fs-chips-push', volume: 1 }] },
  tap: { parts: [{ file: 'bookFlip1', volume: 0.5, cut: 350 }] },
}

const FILES = [...new Set(Object.values(SOUNDS).flatMap((recipe) => recipe.parts.flatMap((part) => part.file)))]

/** Each play's pitch, up or down by at most this fraction. */
const PITCH_SPREAD = 0.04
/** A part that could not start within this many ms of its time (its file was still loading) is dropped, so nothing plays between events. */
const LATE_MS = 400

const MUTE_KEY = 'tricks-muted'
let context: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()
/** Started and not yet ended, some only scheduled, so muting can stop them. */
const playing = new Set<AudioBufferSourceNode>()

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  if (!muted) return warmSounds()
  for (const source of playing) {
    try {
      source.stop()
    } catch {
      // Already stopped.
    }
  }
  playing.clear()
}

/** The context, resumed if it is not running: suspended before a gesture, or interrupted (iOS) after another app took the audio. */
function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (context?.state === 'closed') context = null
  context ??= new AudioContext()
  if (context.state !== 'running') context.resume().catch(() => {})
  return context
}

/** A file's decoded recording, fetched on first use. Offline, it is fetched again next time; a missing file or a bad decode stays silent. */
function load(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(file)
  if (!buffer) {
    buffer = fetch(`/sounds/${file}.mp3`)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then(
        (data) => (data ? ctx.decodeAudioData(data) : null),
        () => {
          buffers.delete(file)
          return null
        },
      )
      .catch(() => null)
    buffers.set(file, buffer)
  }
  return buffer
}

function start(ctx: AudioContext, buffer: AudioBuffer, when: number, part: Part, rate: number): void {
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  source.playbackRate.value = rate
  gain.gain.value = part.volume
  source.connect(gain).connect(ctx.destination)
  source.onended = () => playing.delete(source)
  playing.add(source)
  source.start(when)
  if (part.cut === undefined) return
  const end = when + part.cut / 1000 / rate
  const fade = Math.min(0.15, (part.cut / 1000) * 0.2)
  gain.gain.setValueAtTime(part.volume, end - fade)
  gain.gain.linearRampToValueAtTime(0, end)
  source.stop(end)
}

function buzz(pattern: number | number[] | undefined, after: number): void {
  if (pattern === undefined || typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  const go = () => {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Not allowed yet, or not here.
    }
  }
  if (after > 0) setTimeout(go, after)
  else go()
}

/**
 * Plays a sound now, or `after` ms from now on the audio clock. Its haptic plays even with the
 * sound muted, as the turn's always has.
 */
export function playSound(sound: Sound, after = 0): void {
  try {
    const recipe = SOUNDS[sound]
    buzz(recipe.haptic, after)
    if (isMuted()) return
    const ctx = audio()
    if (!ctx) return
    const due = performance.now() + after
    const rate = 1 + (Math.random() * 2 - 1) * PITCH_SPREAD
    for (const part of recipe.parts) {
      const file = typeof part.file === 'string' ? part.file : part.file[Math.floor(Math.random() * part.file.length)]
      load(ctx, file)
        .then((buffer) => {
          // Muted while it loaded; or a context not running, which would play everything queued at once when it resumes.
          if (!buffer || isMuted() || ctx.state !== 'running') return
          const wait = due + (part.at ?? 0) - performance.now()
          if (wait < -LATE_MS) return
          start(ctx, buffer, ctx.currentTime + Math.max(0, wait) / 1000, part, rate)
        })
        .catch(() => {})
    }
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}

/** Fetches and decodes every recording, so the first play of each is on time. */
export function warmSounds(): void {
  try {
    if (isMuted()) return
    const ctx = audio()
    if (!ctx) return
    for (const file of FILES) void load(ctx, file)
  } catch {
    // As for playSound.
  }
}

/**
 * Browsers start audio only from a gesture, and on a phone a pointerdown is not one (its
 * pointerup is), so every gesture warms the recordings and resumes the context if it has stopped.
 * After the first, that is a few map lookups.
 */
if (typeof document !== 'undefined') {
  for (const type of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(type, () => warmSounds(), { capture: true, passive: true })
}
