/** Choices this device keeps for every game: whether the hand marks the cards that may be played. */
import { useSyncExternalStore } from 'react'

const PLAYABLE_KEY = 'tricks-show-playable'
const listeners = new Set<() => void>()

function stored(): boolean {
  try {
    return localStorage.getItem(PLAYABLE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Held here too, so the choice lasts for the page even where storage is unavailable. */
let marks = typeof localStorage === 'undefined' ? true : stored()

/** On unless turned off. */
export function showsPlayable(): boolean {
  return marks
}

export function setShowsPlayable(on: boolean): void {
  marks = on
  try {
    if (on) localStorage.removeItem(PLAYABLE_KEY)
    else localStorage.setItem(PLAYABLE_KEY, 'off')
  } catch {
    // Kept for this page only.
  }
  listeners.forEach((listener) => listener())
}

/** Another tab's change, or storage being cleared, reaches this one too. */
function onStorage(event: StorageEvent): void {
  if (event.key !== PLAYABLE_KEY && event.key !== null) return
  marks = stored()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

/** Whether the hand marks the cards that may be played, kept in step with the menu's switch. */
export function useShowsPlayable(): boolean {
  return useSyncExternalStore(subscribe, showsPlayable, () => true)
}
