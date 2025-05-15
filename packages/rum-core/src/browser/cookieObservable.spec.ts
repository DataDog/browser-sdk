import type { Subscription } from '@flashcatcloud/browser-core'
import { ONE_MINUTE, deleteCookie, setCookie } from '@flashcatcloud/browser-core'
import type { Clock } from '@flashcatcloud/browser-core/test'
import { mockClock } from '@flashcatcloud/browser-core/test'
import { mockRumConfiguration } from '../../test'
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
    const observable = createCookieObservable(mockRumConfiguration(), COOKIE_NAME)

    subscription = observable.subscribe((cookieChange) => {
      expect(cookieChange).toEqual('foo')

      done()
    })
    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
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
