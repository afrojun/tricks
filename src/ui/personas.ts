import type { Persona, ViewSeat } from '../engine'

export const PERSONA_NAMES: Record<Persona, string> = { straight: 'Straight', sharp: 'Sharp', sly: 'Sly', wild: 'Wild' }

export const PERSONA_CHOICES: { value: Persona | 'surprise'; label: string; text: string }[] = [
  { value: 'straight', label: 'Straight', text: 'Plays fair. Catches about half of careless cheating.' },
  { value: 'sharp', label: 'Sharp', text: 'Plays fair and rarely misses a careless cheat. Patient cheating can still slip past.' },
  { value: 'sly', label: 'Sly', text: 'Cheats when it thinks it can get away with it.' },
  { value: 'wild', label: 'Wild', text: 'Cheats when tempted and accuses on a hunch.' },
  { value: 'surprise', label: 'Surprise me', text: 'One of the four, kept secret until the game ends.' },
]

/** A computer seat's persona as shown at the table: "?" while it is a secret. */
export function personaLabel(seat: ViewSeat): string | null {
  if (seat.kind !== 'ai') return null
  return seat.persona === null ? '?' : PERSONA_NAMES[seat.persona]
}
