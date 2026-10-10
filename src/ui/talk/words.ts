/** What each thing that may be said reads as, and each sticker's name for a screen reader. */
import type { Emote, Line, Throw } from '../../kit/talk'

/** The table words of the voice sheet, as their bubbles read. */
export const LINE_TEXT: Record<Line, string> = {
  yoh: 'Yoh!',
  haibo: 'Haibo!',
  ekse: 'Ekse!',
  eish: 'Eish!',
  aweh: 'Aweh!',
  lekker: 'Lekker!',
  laugh: 'Ha ha ha',
}

export const STICKER_NAME: Record<Emote | Throw, string> = {
  clap: 'Clap',
  howl: 'Howling',
  facepalm: 'Facepalm',
  fire: 'Fire',
  eyes: 'Eyes',
  sweat: 'Sweat',
  pray: 'Pray',
  sleepy: 'Sleepy',
  chappal: 'Chappal',
  rose: 'Rose',
  tomato: 'Tomato',
  chip: 'Respect',
  nudge: 'Nudge',
}
