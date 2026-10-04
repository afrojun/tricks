import type { Transition } from 'motion/react'
import './tokens.css'

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

export const THEMES: Theme[] = [
  {
    id: 'retro',
    name: 'Retro',
    blurb: 'Pixel type on green felt',
    chrome: '#1a4d2e',
    motion: { type: 'tween', duration: 0.18, ease: 'linear' },
    cardBacks: [
      { id: 'crosshatch', name: 'Crosshatch' },
      { id: 'arcade', name: 'Arcade' },
      { id: 'ornamental', name: 'Ornamental' },
    ],
  },
  {
    id: 'modern',
    name: 'Modern table',
    blurb: 'Peacock baize and brass',
    chrome: '#0e3b3c',
    motion: { type: 'spring', stiffness: 380, damping: 30 },
    cardBacks: [{ id: 'brass', name: 'Brass' }],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Flat, quiet, quick to read',
    chrome: '#f4f4f0',
    motion: { type: 'tween', duration: 0.2, ease: 'easeOut' },
    cardBacks: [{ id: 'plain', name: 'Plain' }],
  },
]

const THEME_KEY = 'thunee-theme'
const BACK_KEY = 'thunee-card-back'

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
