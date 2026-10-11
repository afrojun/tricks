import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { currentTarget, notifyState, turnOff, turnOn } from './notify'

/** A browser with a service worker and push, whose subscription and permission each test sets. */
function browser(options: { permission: NotificationPermission; subscribed: boolean; unsubscribeFails?: boolean; ask?: NotificationPermission }) {
  const store = new Map<string, string>()
  let subscription: object | null = null
  const make = () => ({
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: async () => {
      if (options.unsubscribeFails) throw new Error('no')
      subscription = null
      return true
    },
  })
  if (options.subscribed) subscription = make()
  const pushManager = {
    getSubscription: async () => subscription,
    subscribe: async () => (subscription = make()),
  }
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager }) } })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { permission: options.permission, requestPermission: async () => options.ask ?? options.permission })
  return { store, drop: () => (subscription = null) }
}

describe('notifications on this device', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('without a service worker they cannot be had', async () => {
    vi.stubGlobal('navigator', {})
    expect(await notifyState()).toBe('unsupported')
  })

  test('on only while wanted, allowed and subscribed: a subscription the browser dropped is offered again', async () => {
    const b = browser({ permission: 'granted', subscribed: false })
    expect(await notifyState()).toBe('off')
    expect(await turnOn()).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } })
    expect(await notifyState()).toBe('on')
    b.drop()
    expect(await notifyState()).toBe('off')
    expect(await currentTarget()).toBeNull()
  })

  test('a refusal is remembered as the browser says', async () => {
    browser({ permission: 'default', subscribed: false, ask: 'denied' })
    expect(await turnOn()).toBe('denied')
    browser({ permission: 'default', subscribed: false, ask: 'default' })
    expect(await turnOn()).toBe('off')
  })

  test('turned off, they are off and no room is handed the subscription, even if the browser keeps it', async () => {
    browser({ permission: 'granted', subscribed: true, unsubscribeFails: true })
    await turnOn()
    await turnOff()
    expect(await notifyState()).toBe('off')
    expect(await currentTarget()).toBeNull()
  })
})
