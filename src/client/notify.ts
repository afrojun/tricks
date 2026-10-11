/**
 * Notifications on this device: whether they can be had here, whether the player has turned them on,
 * and the push subscription each room this device sits in is given. The subscription is the browser's;
 * the device keeps only whether the player wants them (`tricks-notify`).
 */
import type { PushTarget } from '../protocol'

/** The app's public signing key: the private half is the Worker's secret, `VAPID_PRIVATE_KEY`. */
export const VAPID_PUBLIC_KEY = 'BJWv7YwlSgJxmJsQeb6dnELngq16P1zk05-uIVTkFM_Js3qxcjM4yDdDRBpLunt7TXc7iv71UznlY3oz0cKnSPA'

const KEY = 'tricks-notify'

/** `unsupported`: this browser, or a page without the service worker (`pnpm dev`), cannot have them. */
export type NotifyState = 'unsupported' | 'denied' | 'off' | 'on'

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof PushManager === 'undefined' || typeof Notification === 'undefined') return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

function wanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function want(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // A full or blocked store forgets.
  }
}

export async function notifyState(): Promise<NotifyState> {
  if ((await registration()) === null) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && wanted() ? 'on' : 'off'
}

function targetOf(subscription: PushSubscription): PushTarget | null {
  const json = subscription.toJSON()
  const { endpoint, keys } = json
  return endpoint && keys?.p256dh && keys.auth ? { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } : null
}

function keyBytes(text: string): Uint8Array<ArrayBuffer> {
  const plain = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(plain, (c) => c.charCodeAt(0))
}

/** Asks the player (a tap must call this) and subscribes; the subscription for the rooms, or the state it ended in. */
export async function turnOn(): Promise<PushTarget | Exclude<NotifyState, 'on'>> {
  const reg = await registration()
  if (reg === null) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  try {
    const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
    const target = targetOf(subscription)
    if (target === null) return 'off'
    want(true)
    return target
  } catch {
    return 'off'
  }
}

/** Stops them on this device: the subscription ends, and each room forgets it the next time it pushes. */
export async function turnOff(): Promise<void> {
  want(false)
  const reg = await registration()
  await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => false)
}

/** The subscription to hand a room this device sits in, while notifications are on. */
export async function currentTarget(): Promise<PushTarget | null> {
  if ((await notifyState()) !== 'on') return null
  const subscription = await (await registration())?.pushManager.getSubscription()
  return subscription ? targetOf(subscription) : null
}
