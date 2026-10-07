import type { Transition } from 'motion/react'
import './tokens.css'

/** A table: the one Sunburst look over a colour of felt. */
export interface Theme {
  id: string
  name: string
  blurb: string
  /** Browser chrome colour on phones. */
  chrome: string
  cardBacks: { id: string; name: string }[]
  /** How things move in this theme. */
  motion: Transition
}

const CARD_BACKS = [
  { id: 'red', name: 'Red' },
  { id: 'blue', name: 'Blue' },
  { id: 'ink', name: 'Ink' },
]
/* An ease that overshoots a little, on a fixed clock: a spring's bounce without a spring's long settle, which held played cards in the hand too long. */
const MOTION: Transition = { type: 'tween', duration: 0.22, ease: [0.3, 1.3, 0.5, 1] }

export const THEMES: Theme[] = [
  { id: 'green', name: 'Green', blurb: 'Green baize', chrome: '#0b6d58', motion: MOTION, cardBacks: CARD_BACKS },
  { id: 'blue', name: 'Blue', blurb: 'Blue baize', chrome: '#24488f', motion: MOTION, cardBacks: CARD_BACKS },
  { id: 'red', name: 'Red', blurb: 'Red baize', chrome: '#9c3127', motion: MOTION, cardBacks: CARD_BACKS },
]

const THEME_KEY = 'tricks-theme'
const BACK_KEY = 'tricks-card-back'

/** The saved table; one saved from before there were tables falls back to the first. */
export function currentTheme(): Theme {
  return THEMES.find((t) => t.id === localStorage.getItem(THEME_KEY)) ?? THEMES[0]
}

/** The chosen card back if the theme offers it, otherwise the theme's first. */
export function currentCardBack(theme: Theme = currentTheme()): string {
  const saved = localStorage.getItem(`${BACK_KEY}-${theme.id}`)
  return theme.cardBacks.find((b) => b.id === saved)?.id ?? theme.cardBacks[0].id
}

export function applyTheme(theme: Theme, cardBack?: string): void {
  localStorage.setItem(THEME_KEY, theme.id)
  if (cardBack) localStorage.setItem(`${BACK_KEY}-${theme.id}`, cardBack)
  document.documentElement.dataset.theme = theme.id
  document.documentElement.dataset.cardBack = currentCardBack(theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.chrome)
}
