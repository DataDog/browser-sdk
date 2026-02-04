import type { Subscription } from '../tools/observable'
import type { Clock } from '../../test'
import { mockClock } from '../../test'
import { ONE_MINUTE } from '../tools/utils/timeUtils'
import { setCookie, deleteCookie } from './cookie'
import type { CookieStoreWindow } from './storageObservable'
import {
  WATCH_COOKIE_INTERVAL_DELAY,
  createCookieObservable,
  createLocalStorageObservable,
} from './storageObservable'

const COOKIE_NAME = 'cookie_name'
const COOKIE_DURATION = ONE_MINUTE
const LOCAL_STORAGE_KEY = 'local_storage_key'

describe('cookieObservable', () => {
  let subscription: Subscription
  let originalCookieStore: PropertyDescriptor | undefined
  let clock: Clock

  beforeEach(() => {
    deleteCookie(COOKIE_NAME)
    clock = mockClock()
    originalCookieStore = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  })

  afterEach(() => {
    subscription?.unsubscribe()
    if (originalCookieStore) {
      Object.defineProperty(window, 'cookieStore', originalCookieStore)
    }
  })

  it('should notify observers on cookie change', async () => {
    const observable = createCookieObservable({}, COOKIE_NAME)

    const cookieChangePromise = new Promise((resolve) => {
      subscription = observable.subscribe(resolve)
    })

    // When writing a cookie just after subscribing to the cookieStore 'change' event, the 'change'
    // event is sometimes not triggered, making this test case flaky.
    // To work around this, we get some random cookie from the cookieStore. This adds enough delay
    // to ensure that the 'change' event is triggered when we write our cookie.
    // This was reported here: https://issues.chromium.org/issues/420405275
    const cookieStore = (window as CookieStoreWindow).cookieStore
    if (cookieStore) {
      // Wait for the cookieStore to be ready
      await cookieStore.get('some_cookie_name')
    }

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    const cookieChange = await cookieChangePromise
    expect(cookieChange).toEqual('foo')
  })

  it('should notify observers on cookie change when cookieStore is not supported', () => {
    Object.defineProperty(window, 'cookieStore', { get: () => undefined, configurable: true })
    const observable = createCookieObservable({}, COOKIE_NAME)

    let cookieChange: string | undefined
    subscription = observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    expect(cookieChange).toEqual('foo')
  })

  it('should not notify observers on cookie change when the cookie value has not changed when cookieStore is not supported', () => {
    Object.defineProperty(window, 'cookieStore', { get: () => undefined, configurable: true })
    const observable = createCookieObservable({}, COOKIE_NAME)

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)

    let cookieChange: string | undefined
    subscription = observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    expect(cookieChange).toBeUndefined()
  })
})

describe('localStorageObservable', () => {
  let subscription: Subscription

  beforeEach(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  })

  afterEach(() => {
    subscription?.unsubscribe()
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  })

  it('should notify observers on localStorage change from another tab (simulated)', () => {
    const observable = createLocalStorageObservable({ allowUntrustedEvents: true }, LOCAL_STORAGE_KEY)

    let storageChange: string | undefined
    subscription = observable.subscribe((change) => (storageChange = change))

    // Simulate storage event from another tab
    const event = new StorageEvent('storage', {
      key: LOCAL_STORAGE_KEY,
      newValue: 'bar',
    })
    window.dispatchEvent(event)

    expect(storageChange).toEqual('bar')
  })

  it('should notify observers with undefined when key is deleted', () => {
    const observable = createLocalStorageObservable({ allowUntrustedEvents: true }, LOCAL_STORAGE_KEY)

    let storageChange: string | undefined = 'initial'
    subscription = observable.subscribe((change) => (storageChange = change))

    // Simulate storage event with null newValue (key deleted)
    const event = new StorageEvent('storage', {
      key: LOCAL_STORAGE_KEY,
      newValue: null,
    })
    window.dispatchEvent(event)

    expect(storageChange).toBeUndefined()
  })

  it('should not notify observers when a different key changes', () => {
    const observable = createLocalStorageObservable({ allowUntrustedEvents: true }, LOCAL_STORAGE_KEY)

    let notified = false
    subscription = observable.subscribe(() => (notified = true))

    // Simulate storage event for a different key
    const event = new StorageEvent('storage', {
      key: 'different_key',
      newValue: 'value',
    })
    window.dispatchEvent(event)

    expect(notified).toBe(false)
  })

  it('should stop listening when unsubscribed', () => {
    const observable = createLocalStorageObservable({ allowUntrustedEvents: true }, LOCAL_STORAGE_KEY)

    let notifyCount = 0
    subscription = observable.subscribe(() => (notifyCount += 1))

    // First event
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STORAGE_KEY, newValue: 'a' }))
    expect(notifyCount).toBe(1)

    // Unsubscribe
    subscription.unsubscribe()

    // Second event should not be received
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STORAGE_KEY, newValue: 'b' }))
    expect(notifyCount).toBe(1)
  })
})
