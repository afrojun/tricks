import { MotionConfig } from 'motion/react'
import { type ReactNode, createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { type Session, openSession } from '../client/connection'
import type { ClientState } from '../client/store'
import { type Theme, applyTheme, currentCardBack, currentTheme } from '../themes'

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ room, children }: { room: string; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    const opened = openSession(room)
    setSession(opened)
    return () => opened.close()
  }, [room])
  if (!session) return null
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession outside SessionProvider')
  return session
}

/** Everything the server last told this client. */
export function useClient(): ClientState {
  const { store } = useSession()
  return useSyncExternalStore(store.subscribe, store.getState)
}

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
