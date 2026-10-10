import { useMemo } from 'react'
import { useCoach } from './coach/context'
import { useCountdown, useSession } from './session'
import { plural } from './text'

/** Seconds left until a deadline on the room's clock, over a bar that drains. */
export function Timer({ deadline, totalSeconds }: { deadline: number; totalSeconds: number }) {
  const { store } = useSession()
  const seconds = useCountdown(deadline)
  const coached = useCoach()
  // The bar runs on its own clock from where the countdown stood when this deadline was first drawn, at the
  // rate the table's clock runs. Frozen per deadline and rate: changing a running animation's duration would
  // make it race ahead, so a new rate starts the bar again from where the countdown stands.
  const rate = store.clockRate
  const { remaining, fraction } = useMemo(() => {
    const left = Math.max(0, deadline - store.serverNow(Date.now()))
    return { remaining: left / rate, fraction: Math.min(1, left / (totalSeconds * 1000)) }
  }, [deadline, totalSeconds, store, rate])
  // Practice time stands still while the table waits for the player.
  if (coached?.state.waiting) return <p className="text-center text-on-surface-muted">No rush: the table waits for you.</p>
  return (
    <div className="grid gap-1">
      <p className={`display text-3xl text-center ${seconds <= 3 ? 'text-danger' : ''}`} aria-label={`${plural(seconds, 'second')} left`}>
        {seconds}
      </p>
      <div className="timer-bar" data-urgent={seconds <= 3}>
        <i key={`${deadline}:${rate}`} style={{ '--from': fraction, animationDuration: `${remaining}ms` } as React.CSSProperties} />
      </div>
    </div>
  )
}
