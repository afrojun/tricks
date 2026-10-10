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

/**
 * While `active`, the browser's back button (and a phone's back gesture) does not leave the table. A copy
 * of the table's address sits on top of the history; going back from it puts it back and calls `onBack`,
 * unless a sheet is open, which back closes instead (a sheet closes on Escape). Once inactive the copy is
 * marked spent, and the next activation takes it up again rather than adding another.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const latest = useRef(onBack)
  latest.current = onBack
  useEffect(() => {
    if (!active) return
    const here = location.pathname + location.search
    const guard = { tricksGuard: true }
    if (history.state?.tricksSpent) history.replaceState(guard, '')
    else if (!history.state?.tricksGuard) history.pushState(guard, '')
    const onPop = () => {
      // The app's own moves to another address, and coming forward onto the copy, are not back.
      if (location.pathname + location.search !== here || history.state?.tricksGuard) return
      history.pushState(guard, '')
      const sheet = document.querySelector('[role="dialog"]')
      if (sheet) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      else latest.current()
    }
    addEventListener('popstate', onPop)
    return () => {
      removeEventListener('popstate', onPop)
      if (history.state?.tricksGuard) history.replaceState({ tricksSpent: true }, '')
    }
  }, [active])
}
