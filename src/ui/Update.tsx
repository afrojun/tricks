import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** How often an open app asks whether a new version has been deployed. A page that is never navigated would otherwise never find out. */
const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * Registers the service worker and offers each new version as a choice. The old pages keep running until
 * the player reloads, so a deploy never interrupts a table; a room survives the reload, since everything
 * it knows is saved on the server. Accepting in one tab brings the new worker in for every tab of the
 * site, but only the tab that accepted reloads: the others keep their table and keep the offer up.
 * While the offer shows, `data-update` on the document makes room for it (`--update-h` in index.css).
 */
export function Update() {
  const accepted = useRef(false)
  // Set once the new worker controls this page (another tab accepted): Reload then needs no worker to wake.
  const controlled = useRef(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const {
    needRefresh: [ready, setReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, found) => setRegistration(found ?? null),
    onNeedReload() {
      controlled.current = true
      if (accepted.current) window.location.reload()
      else setReady(true)
    },
  })
  useEffect(() => {
    if (!registration) return
    const timer = setInterval(() => void registration.update(), CHECK_EVERY_MS)
    return () => clearInterval(timer)
  }, [registration])
  useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.update = ''
    return () => {
      delete document.documentElement.dataset.update
    }
  }, [ready])
  if (!ready) return null
  const reload = () => {
    accepted.current = true
    if (controlled.current) window.location.reload()
    else void updateServiceWorker()
  }
  return (
    <div className="update" role="status">
      <p>A new version is ready.</p>
      <button type="button" className="btn btn-small btn-quiet" onClick={() => setReady(false)}>
        Later
      </button>
      <button type="button" className="btn btn-small btn-primary" onClick={reload}>
        Reload
      </button>
    </div>
  )
}
