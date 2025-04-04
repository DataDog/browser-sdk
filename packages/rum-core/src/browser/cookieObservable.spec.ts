import type { Subscription } from '@datadog/browser-core'
import { ONE_MINUTE, deleteCookie, setCookie } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
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

  it('should notify observers on cookie change', (done) => {
    const observable = createCookieObservable(COOKIE_NAME)

    subscription = observable.subscribe((cookieChange) => {
      expect(cookieChange).toEqual('foo')

      done()
    })
    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
  })

  it('should not notify observers on cookie change when the cookie value has not changed', () => {
    const observable = createCookieObservable(COOKIE_NAME)

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)

    let cookieChange: string | undefined
    subscription = observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

    expect(cookieChange).toBeUndefined()
  })
})
