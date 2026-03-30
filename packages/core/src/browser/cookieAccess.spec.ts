import type { Clock } from '../../test'
import { collectAsyncCalls, mockClock, registerCleanupTask, replaceMockable } from '../../test'
import type { Configuration } from '../domain/configuration'
import { detectVersion, isChromium } from '../tools/utils/browserDetection'
import type { CookieOptions } from './cookie'
import { deleteCookie, getCookie, setCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'
import { createCookieAccess, WATCH_COOKIE_INTERVAL_DELAY } from './cookieAccess'

const COOKIE_NAME = 'test_cookie'
const COOKIE_OPTIONS = { secure: false, crossSite: false, partitioned: false }
const MOCK_CONFIGURATION = { allowUntrustedEvents: true } as Configuration

function disableCookieStore() {
  replaceMockable((window as CookieStoreWindow).cookieStore, undefined)
}

function setCookieWithCleanup(name: string, value: string, expireDelay: number = 0, options?: CookieOptions) {
  setCookie(name, value, expireDelay, options)
  registerCleanupTask(() => deleteCookie(name, options))
}

describe('cookieAccess', () => {
  const setups = [
    {
      title: 'document.cookie fallback',
      setup: () => {
        disableCookieStore()
        const clock = mockClock()

        return {
          clock,
          flushObservable(this: void, _spy: jasmine.Spy) {
            clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
            return Promise.resolve()
          },
        }
      },
    },
    {
      title: 'CookieStore API',
      setup: () => {
        const clock = mockClock()

        if (!(window as CookieStoreWindow).cookieStore) {
          pending('CookieStore API not available')
          return {} as { flushObservable: (spy: jasmine.Spy) => Promise<void>; clock: Clock }
        }

        return {
          clock,
          async flushObservable(this: void, spy: jasmine.Spy) {
            await collectAsyncCalls(spy, 1)
          },
        }
      },
    },
  ]

  for (const { title, setup } of setups) {
    describe(title, () => {
      describe('getAllAndSet', () => {
        it('should pass current cookie values to callback', async () => {
          setup()
          setCookieWithCleanup(COOKIE_NAME, 'value1', 1000)

          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: 1000 }
          })

          expect(capturedValues).toEqual(['value1'])
        })

        it('should pass empty array when cookie does not exist', async () => {
          setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: 1000 }
          })

          expect(capturedValues).toEqual([])
        })

        it('should write the value returned by the callback', async () => {
          setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

          await cookieAccess.getAllAndSet(() => ({ value: 'hello', expireDelay: 1000 }))

          expect(getCookie(COOKIE_NAME)).toBe('hello')
        })

        it('should pass all cookie values to callback', async () => {
          const browserVersion = detectVersion()
          if (!isChromium() || (browserVersion !== undefined && browserVersion < 145)) {
            pending('Only Recent Chromium supports multiple cookies with the same name with different options')
          }

          setup()
          setCookieWithCleanup(COOKIE_NAME, 'value1', 1000)
          setCookieWithCleanup(COOKIE_NAME, 'value2', 1000, { secure: true, partitioned: true })

          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: 1000 }
          })

          expect(capturedValues).toEqual(['value1', 'value2'])
        })
      })

      describe('observable', () => {
        it('should notify when cookie is changed externally', async () => {
          const { flushObservable } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
          const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          setCookieWithCleanup(COOKIE_NAME, 'external', 1000)
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledOnceWith('external')
        })

        it('should notify when cookie is deleted externally', async () => {
          const { flushObservable } = setup()
          setCookieWithCleanup(COOKIE_NAME, 'existing', 1000)

          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
          const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          deleteCookie(COOKIE_NAME)
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledOnceWith(undefined)
        })

        it('should not notify when cookie value is unchanged', () => {
          const { clock } = setup()
          setCookieWithCleanup(COOKIE_NAME, 'stable', 1000)

          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
          const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          clock.tick(WATCH_COOKIE_INTERVAL_DELAY * 10) // Ensure we are well past the debounce delay

          expect(spy).not.toHaveBeenCalled()
        })

        it('should notify the observable after writing', async () => {
          const { flushObservable } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
          const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          await cookieAccess.getAllAndSet(() => ({ value: 'written', expireDelay: 1000 }))
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledOnceWith('written')
        })
      })
    })
  }
})
