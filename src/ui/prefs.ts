/** Choices this device keeps for every game: whether the hand marks the cards that may be played, and whether the table talks. */
import { useSyncExternalStore } from 'react'

/** A switch kept under `key`: on unless turned off, and kept in step across tabs. */
function switchPref(key: string) {
  const listeners = new Set<() => void>()
  const stored = (): boolean => {
    try {
      return localStorage.getItem(key) !== 'off'
    } catch {
      return true
    }
  }
  /** Held here too, so the choice lasts for the page even where storage is unavailable. */
  let on = typeof localStorage === 'undefined' ? true : stored()

  const get = (): boolean => on
  const set = (value: boolean): void => {
    on = value
    try {
      if (value) localStorage.removeItem(key)
      else localStorage.setItem(key, 'off')
    } catch {
      // Kept for this page only.
    }
    listeners.forEach((listener) => listener())
  }
  /** Another tab's change, or storage being cleared, reaches this one too. */
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== key && event.key !== null) return
    on = stored()
    listeners.forEach((listener) => listener())
  }
  const subscribe = (listener: () => void): (() => void) => {
    if (listeners.size === 0) window.addEventListener('storage', onStorage)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) window.removeEventListener('storage', onStorage)
    }
  }
  const use = (): boolean => useSyncExternalStore(subscribe, get, () => true)
  return { get, set, use }
}

const playable = switchPref('tricks-show-playable')
const talk = switchPref('tricks-talk')

/** Whether the hand marks the cards that may be played. On unless turned off. */
export const showsPlayable = playable.get
export const setShowsPlayable = playable.set
/** Whether the hand marks the cards that may be played, kept in step with the menu's switch. */
export const useShowsPlayable = playable.use

/** Whether lines, emotes and throws show and sound here ("Reactions" in the game menu). On unless turned off. */
export const talksOn = talk.get
export const setTalksOn = talk.set
export const useTalksOn = talk.use
