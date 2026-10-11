/*
 * Notifications, in the service worker Workbox writes (`importScripts` in vite.config.ts). A room
 * pushes a game's news as JSON: a title, a line under it, the game's address, and a tag, so a newer
 * push about the same game replaces the last. A tap opens the game, in a window already showing it
 * if there is one. The app's badge says something waits; the Tricks home clears it.
 */
self.addEventListener('push', (event) => {
  let message
  try {
    message = event.data.json()
  } catch {
    return
  }
  if (typeof message?.title !== 'string' || typeof message?.url !== 'string') return
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, {
        body: typeof message.body === 'string' ? message.body : '',
        tag: typeof message.tag === 'string' ? message.tag : undefined,
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: message.url },
      }),
      self.navigator.setAppBadge?.().catch(() => {}),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url
  // Only an address of this app: a path, never another site.
  const url = new URL(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/', self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === url.pathname)
      if (open) return open.focus()
      return self.clients.openWindow(url.href)
    }),
  )
})
