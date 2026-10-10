import { useEffect, useRef } from 'react'
import { useCoach } from './coach/context'
import { gamePath } from './routes'
import { navigate, useGameClient } from './session'

/** What leaving a table costs, and the choice: Leave goes to the game's home; Stay takes the focus, and `onStay` closes the question. */
export function LeaveQuestion({ onStay }: { onStay: () => void }) {
  const game = useGameClient()
  const coached = useCoach()
  return (
    <div className="grid gap-3">
      <p className="text-on-surface-muted">
        {coached
          ? 'Your practice game is saved on this device, so you can carry on later.'
          : 'Your seat is kept: open this game’s link again to sit back down. While you are away, the host can let a computer play for you.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-danger" onClick={() => navigate(gamePath(game.id))}>
          Leave
        </button>
        <button className="btn" onClick={onStay} autoFocus>
          Stay
        </button>
      </div>
    </div>
  )
}

/** The address the guard copy shows: the table's, as the app last set it. */
let guardUrl = ''

/** Changes the table's address in place, the guard copy's too, so going back keeps it. */
export function replaceTableAddress(path: string): void {
  history.replaceState(history.state, '', path)
  if (history.state?.tricksGuard) guardUrl = path
}

/**
 * While `active`, the browser's back button (and a phone's back gesture) does not leave the table. The
 * table's history entry is marked, and a copy of it sits on top; going back from the copy lands on the
 * marked entry, which puts the copy back and calls `onBack`, unless a sheet is open, which back closes
 * instead (a sheet closes on Escape). Once inactive the copy is marked spent, and the next activation
 * takes it up again rather than adding another.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const latest = useRef(onBack)
  latest.current = onBack
  useEffect(() => {
    if (!active) return
    // Each table's entries carry its own id, so another table's marked entry, reached through the history, is left alone.
    const state = history.state
    const id: string = state?.tricksGuard ?? state?.tricksSpent ?? Math.random().toString(36).slice(2)
    const guard = { tricksGuard: id }
    if (state?.tricksSpent) history.replaceState(guard, '')
    else if (!state?.tricksGuard) {
      history.replaceState({ ...state, tricksBelow: id }, '')
      history.pushState(guard, '')
    }
    guardUrl = location.pathname + location.search
    const onPop = () => {
      // Only back from the copy lands on its marked entry: the app's own moves and coming forward do not.
      if (history.state?.tricksBelow !== id) return
      history.pushState(guard, '', guardUrl)
      const sheet = document.querySelector('[role="dialog"]')
      if (sheet) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      else latest.current()
    }
    addEventListener('popstate', onPop)
    return () => {
      removeEventListener('popstate', onPop)
      if (history.state?.tricksGuard === id) history.replaceState({ tricksSpent: id }, '')
    }
  }, [active])
}
