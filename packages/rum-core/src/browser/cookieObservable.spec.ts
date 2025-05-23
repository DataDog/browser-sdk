import type { Subscription } from '@datadog/browser-core'
import { ONE_MINUTE, deleteCookie, setCookie } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { CookieStoreWindow } from './cookieObservable'
import { WATCH_COOKIE_INTERVAL_DELAY, createCookieObservable } from './cookieObservable'

const COOKIE_NAME = 'cookie_name'
const COOKIE_DURATION = ONE_MINUTE

describe('cookieObservable', () => {
  let subscription: Subscription
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clock: Clock
  beforeEach(() => {
    deleteCookie(COOKIE_NAME)
    clock = mockClock()
    originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  })

  afterEach(() => {
    subscription?.unsubscribe()
    if (originalSupportedEntryTypes) {
      Object.defineProperty(window, 'cookieStore', originalSupportedEntryTypes)
    }
    clock.cleanup()
  })

  it('should notify observers on cookie change', async () => {
    const observable = createCookieObservable(mockRumConfiguration(), COOKIE_NAME)

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
    const observable = createCookieObservable(mockRumConfiguration(), COOKIE_NAME)

    let cookieChange: string | undefined
    subscription = observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    expect(cookieChange).toEqual('foo')
  })

  it('should not notify observers on cookie change when the cookie value as not changed when cookieStore is not supported', () => {
    Object.defineProperty(window, 'cookieStore', { get: () => undefined, configurable: true })
    const observable = createCookieObservable(mockRumConfiguration(), COOKIE_NAME)

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)

    let cookieChange: string | undefined
    subscription = observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    expect(cookieChange).toBeUndefined()
  })
})
