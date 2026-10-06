import { MotionConfig } from 'motion/react'
import { type ReactNode, createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { type Session, openSession } from '../client/connection'
import type { ClientState } from '../client/store'
import type { TableAction } from '../kit/table'
import { type Theme, applyTheme, currentCardBack, currentTheme } from '../themes'
import type { AnyGameClient, ShellView } from './contract'

// ── The game ─────────────────────────────────────────────────────────────

const GameContext = createContext<AnyGameClient | null>(null)

/** Provided under a game's address, once its screens have loaded. */
export const GameProvider = GameContext.Provider

/** The screens of the game whose address this is. */
export function useGameClient(): AnyGameClient {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGameClient outside a game')
  return game
}

// ── The table ────────────────────────────────────────────────────────────

/** What the shell sends to any game: the table's actions, and the rules the lobby sets. */
export type ShellAction = TableAction | { type: 'setRules'; overrides: object }

/** Any game's table, online or in practice, as the shell holds it. */
export type ShellSession = Session<ShellView, ShellAction, { type: string }>

/** Provided by `SessionProvider` online, and by the practice screen offline. */
export const SessionContext = createContext<ShellSession | null>(null)

/** Opens a room of the game whose address this is. */
export function SessionProvider({ room, children }: { room: string; children: ReactNode }) {
  const game = useGameClient()
  const [session, setSession] = useState<ShellSession | null>(null)
  useEffect(() => {
    const opened = openSession<ShellView, ShellAction, { type: string }>(game, room)
    setSession(opened)
    return () => opened.close()
  }, [game, room])
  if (!session) return null
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

/**
 * The hooks screens read the table through, typed by a game's view, action and event. Sound
 * because the shell draws a game's screens only inside a session opened with that game's client.
 */
export function sessionHooks<V extends ShellView, A, E>() {
  function useSession(): Session<V, A, E> {
    const session = useContext(SessionContext)
    if (!session) throw new Error('useSession outside a session')
    return session as unknown as Session<V, A, E>
  }
  /** Everything the server last told this client. */
  function useClient(): ClientState<V> {
    const { store } = useSession()
    return useSyncExternalStore(store.subscribe, store.getState)
  }
  return { useSession, useClient }
}

/** The shell's own: any game's table, as far as the shell reads it. */
export const { useSession, useClient } = sessionHooks<ShellView, ShellAction, { type: string }>()

/** Whole seconds left until a server deadline, by the server's clock. */
export function useCountdown(deadline: number | null): number {
  const { store } = useSession()
  const left = () => (deadline === null ? 0 : Math.max(0, Math.ceil((deadline - store.serverNow(Date.now())) / 1000)))
  const [seconds, setSeconds] = useState(left)
  useEffect(() => {
    setSeconds(left())
    if (deadline === null) return
    const timer = setInterval(() => setSeconds(left()), 200)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline])
  return seconds
}

// ── Theme ────────────────────────────────────────────────────────────────

interface ThemeState {
  theme: Theme
  cardBack: string
  setTheme: (theme: Theme, cardBack?: string) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    const theme = currentTheme()
    applyTheme(theme)
    return { theme, cardBack: currentCardBack(theme) }
  })
  const setTheme = (theme: Theme, cardBack?: string) => {
    applyTheme(theme, cardBack)
    setState({ theme, cardBack: currentCardBack(theme) })
  }
  return (
    <ThemeContext.Provider value={{ ...state, setTheme }}>
      {/* "user" drops travel and keeps fades when the system asks for reduced motion. */}
      <MotionConfig reducedMotion="user" transition={state.theme.motion}>
        {children}
      </MotionConfig>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext)
  if (!state) throw new Error('useTheme outside ThemeProvider')
  return state
}

// ── Navigation ───────────────────────────────────────────────────────────

export function navigate(path: string): void {
  history.pushState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath(): string {
  return useSyncExternalStore(
    (notify) => {
      addEventListener('popstate', notify)
      return () => removeEventListener('popstate', notify)
    },
    () => location.pathname,
  )
}
