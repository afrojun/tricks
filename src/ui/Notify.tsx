import { useEffect, useState } from 'react'
import { type NotifyState, notifyState, turnOff, turnOn } from '../client/notify'
import { useSession } from './session'

/** Whether this device's notifications are on, and the two ways to change that; null while it is being found out. */
export function useNotify(): { state: NotifyState | null; on: () => Promise<void>; off: () => Promise<void> } {
  const { push } = useSession()
  const [state, setState] = useState<NotifyState | null>(null)
  useEffect(() => {
    let live = true
    void notifyState().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])
  return {
    state,
    // Asked from a tap, as browsers require. The room this screen is open on hears at once; the others as each is opened.
    on: async () => {
      const result = await turnOn()
      if (typeof result === 'string') return setState(result)
      push(result)
      setState('on')
    },
    off: async () => {
      await turnOff()
      push(null)
      setState('off')
    },
  }
}

/** An iPhone or iPad's Safari, outside the app added to the home screen: the only place it has no notifications. */
function iosBrowser(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone
}

/** Offers notifications at a table playing over days, until they are on; or says why they cannot be had. */
export function NotifyOffer() {
  const { state, on } = useNotify()
  // Subscribing can take the browser a few seconds: one tap is enough.
  const [asking, setAsking] = useState(false)
  if (state === 'on' || state === null) return null
  if (state === 'denied') return <p className="text-sm text-on-surface-muted">Notifications are off for Tricks in your phone’s settings.</p>
  if (state === 'unsupported') {
    return iosBrowser() ? <p className="text-sm text-on-surface-muted">To get notifications on an iPhone, add Tricks to your home screen first.</p> : null
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm">Tricks can tell you when it’s your turn, even with the app closed.</p>
      <button
        className="btn btn-small"
        disabled={asking}
        onClick={() => {
          setAsking(true)
          void on().finally(() => setAsking(false))
        }}
      >
        Turn on notifications
      </button>
    </div>
  )
}
