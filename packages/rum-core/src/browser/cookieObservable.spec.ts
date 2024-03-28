import type { Subscription } from '@datadog/browser-core'
import { ONE_MINUTE, STORAGE_POLL_DELAY, deleteCookie, setCookie } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { RumConfiguration } from '../domain/configuration'
import { createCookieObservable } from './cookieObservable'
import type { CookieChange, CookieObservable } from './cookieObservable'

const COOKIE_NAME = 'cookie_name'
const COOKIE_DURATION = ONE_MINUTE

describe('cookieObservable', () => {
  let observable: CookieObservable
  let subscription: Subscription
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clock: Clock
  beforeEach(() => {
    clock = mockClock()
    observable = createCookieObservable({} as RumConfiguration, COOKIE_NAME)
    originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  })

  afterEach(() => {
    subscription?.unsubscribe()
    if (originalSupportedEntryTypes) {
      Object.defineProperty(window, 'cookieStore', originalSupportedEntryTypes)
    }
    clock.cleanup()
    deleteCookie(COOKIE_NAME)
  })

  it('should notify observers on cookie change', (done) => {
    subscription = observable.subscribe((cookieChange) => {
      expect(cookieChange).toEqual({
        name: COOKIE_NAME,
        value: 'foo',
      })

      done()
    })
    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(STORAGE_POLL_DELAY)
  })

  it('should notify observers on cookie change when cookieStore is not supported', () => {
    Object.defineProperty(window, 'cookieStore', { get: () => undefined })
    let cookieChange: CookieChange | undefined
    observable.subscribe((change) => (cookieChange = change))

    setCookie(COOKIE_NAME, 'foo', COOKIE_DURATION)
    clock.tick(STORAGE_POLL_DELAY)

    expect(cookieChange).toEqual({
      name: COOKIE_NAME,
      value: 'foo',
    })
  })
})
