import { vi, describe, expect, it, type Mock } from 'vitest'
import { ONE_MINUTE, dateNow } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { Clock } from '../../test'
import { collectAsyncCalls, mockClock, registerCleanupTask, replaceMockable } from '../../test'
import { display } from '../tools/display'
import { detectVersion, isChromium } from '../tools/utils/browserDetection'
import type { CookieOptions } from './cookie'
import { deleteCookie, getCookie, setCookie } from './cookie'
import type { CookieAccess } from './cookieAccess'
import {
  areCookiesAuthorized,
  createCookieStoreAccess,
  createDocumentCookieAccess,
  isCookieStoreSupported,
  WATCH_COOKIE_INTERVAL_DELAY,
} from './cookieAccess'

const COOKIE_NAME = 'test_cookie'
const COOKIE_OPTIONS = { secure: false, crossSite: false, partitioned: false }

function disableCookieStore() {
  replaceMockable(globalObject.cookieStore, undefined)
}

interface setupResult {
  clock: Clock
  createCookieAccess: (name: string, options: CookieOptions) => CookieAccess
  flushObservable: (spy: Mock) => Promise<void>
  setCookieWithCleanup: (
    this: void,
    name: string,
    value: string,
    expireDelay?: number,
    options?: CookieOptions
  ) => Promise<void>
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
          createCookieAccess: (name: string, options: CookieOptions) => createDocumentCookieAccess(name, options),
          flushObservable(this: void, _spy: Mock) {
            clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
            return Promise.resolve()
          },
          setCookieWithCleanup(
            this: void,
            name: string,
            value: string,
            expireDelay: number = 0,
            options?: CookieOptions
          ) {
            setCookie(name, value, expireDelay, options)
            registerCleanupTask(() => deleteCookie(name, options))
            return Promise.resolve()
          },
        }
      },
    },
    {
      title: 'CookieStore API',
      setup: () => {
        const clock = mockClock()

        if (!globalObject.cookieStore) {
          return {} as setupResult
        }

        return {
          clock,
          createCookieAccess: (name: string, options: CookieOptions) => createCookieStoreAccess(name, options),
          async flushObservable(this: void, spy: Mock) {
            await collectAsyncCalls(spy, 1)
            // Reset the spy calls to avoid throwing on unexpected calls during teardown
            registerCleanupTask(() => spy.mockClear())
          },
          async setCookieWithCleanup(
            this: void,
            name: string,
            value: string,
            expireDelay: number = 0,
            options?: CookieOptions
          ) {
            await cookieStore?.set({
              name,
              value,
              expires: dateNow() + expireDelay,
              path: '/',
              sameSite: options?.crossSite ? 'none' : 'strict',
              domain: options?.domain,
              partitioned: options?.partitioned,
            })

            registerCleanupTask(async () => {
              await cookieStore?.delete({
                name,
                domain: options?.domain,
                partitioned: options?.partitioned,
              })
            })
          },
        }
      },
    },
  ]

  for (const { title, setup } of setups) {
    describe(title, () => {
      describe('getAllAndSet', () => {
        it('should pass current cookie values to callback', async () => {
          const { createCookieAccess, setCookieWithCleanup } = setup()
          await setCookieWithCleanup(COOKIE_NAME, 'value1', ONE_MINUTE)

          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: ONE_MINUTE }
          })

          expect(capturedValues).toEqual(['value1'])
        })

        it('should pass empty array when cookie does not exist', async () => {
          const { createCookieAccess } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: ONE_MINUTE }
          })

          expect(capturedValues).toEqual([])
        })

        it('should write the value returned by the callback', async () => {
          const { createCookieAccess } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

          await cookieAccess.getAllAndSet(() => ({ value: 'hello', expireDelay: ONE_MINUTE }))

          expect(getCookie(COOKIE_NAME)).toBe('hello')
        })

        it('should pass all cookie values to callback', async (ctx) => {
          const browserVersion = detectVersion()
          if (!isChromium() || (browserVersion !== undefined && browserVersion < 145)) {
            ctx.skip(true, 'Only Recent Chromium supports multiple cookies with the same name with different options')
          }

          const { createCookieAccess, setCookieWithCleanup } = setup()
          await setCookieWithCleanup(COOKIE_NAME, 'value1', ONE_MINUTE)
          await setCookieWithCleanup(COOKIE_NAME, 'value2', ONE_MINUTE, { secure: true, partitioned: true })

          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

          let capturedValues: string[] | undefined
          await cookieAccess.getAllAndSet((values) => {
            capturedValues = values
            return { value: 'new', expireDelay: ONE_MINUTE }
          })

          expect(capturedValues).toEqual(['value1', 'value2'])
        })
      })

      describe('observable', () => {
        it('should notify when cookie is changed externally', async () => {
          const { createCookieAccess, flushObservable, setCookieWithCleanup } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)
          const spy = vi.fn()
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          await setCookieWithCleanup(COOKIE_NAME, 'external', ONE_MINUTE)
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledTimes(1)
        })

        it('should notify when cookie is deleted externally', async () => {
          const { createCookieAccess, flushObservable, setCookieWithCleanup } = setup()
          await setCookieWithCleanup(COOKIE_NAME, 'existing', ONE_MINUTE)

          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)
          const spy = vi.fn()
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          deleteCookie(COOKIE_NAME)
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledTimes(1)
        })

        it('should not notify when cookie value is unchanged', async () => {
          const { createCookieAccess, clock, setCookieWithCleanup } = setup()
          await setCookieWithCleanup(COOKIE_NAME, 'stable', ONE_MINUTE)

          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)
          const spy = vi.fn()
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          clock.tick(WATCH_COOKIE_INTERVAL_DELAY * 10) // Ensure we are well past the debounce delay

          expect(spy).not.toHaveBeenCalled()
        })

        it('should notify the observable after writing', async () => {
          const { createCookieAccess, flushObservable } = setup()
          const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)
          const spy = vi.fn()
          const subscription = cookieAccess.observable.subscribe(spy)
          registerCleanupTask(() => subscription.unsubscribe())

          await cookieAccess.getAllAndSet(() => ({ value: 'written', expireDelay: ONE_MINUTE }))
          await flushObservable(spy)

          expect(spy).toHaveBeenCalledTimes(1)
        })
      })
    })
  }

  describe('areCookiesAuthorized', () => {
    it('returns true when the access can write and read back the test cookie', async () => {
      const access: CookieAccess = {
        getAll: vi.fn().mockReturnValue(Promise.resolve(['test'])),
        getAllAndSet: vi.fn().mockReturnValue(Promise.resolve()),
        observable: null as any,
      }
      const factory = vi.fn().mockReturnValue(access)

      const result = await areCookiesAuthorized(factory, COOKIE_OPTIONS)

      expect(result).toBe(true)
      expect(factory).toHaveBeenCalledWith(expect.any(String), COOKIE_OPTIONS)
    })

    it('returns false when the access cannot read back the test cookie', async () => {
      const access: CookieAccess = {
        getAll: () => Promise.resolve([]),
        getAllAndSet: () => Promise.resolve(),
        observable: null as any,
      }

      const result = await areCookiesAuthorized(() => access, COOKIE_OPTIONS)

      expect(result).toBe(false)
    })

    it('returns false and logs when the access throws', async () => {
      const displayErrorSpy = vi.spyOn(display, 'error')
      const access: CookieAccess = {
        getAll: () => Promise.resolve([]),
        getAllAndSet: () => Promise.reject(new Error('boom')),
        observable: null as any,
      }

      const result = await areCookiesAuthorized(() => access, COOKIE_OPTIONS)

      expect(result).toBe(false)
      expect(displayErrorSpy).toHaveBeenCalled()
    })

    it('cleans up the test cookie after the check', async () => {
      const calls: Array<{ value: string; expireDelay: number }> = []
      const access: CookieAccess = {
        getAll: () => Promise.resolve(['test']),
        getAllAndSet: (cb) => {
          calls.push(cb([]))
          return Promise.resolve()
        },
        observable: null as any,
      }

      await areCookiesAuthorized(() => access, COOKIE_OPTIONS)

      expect(calls).toEqual([
        { value: 'test', expireDelay: expect.any(Number) },
        { value: '', expireDelay: 0 },
      ])
    })

    it('works with the real createDocumentCookieAccess', async () => {
      disableCookieStore()
      const result = await areCookiesAuthorized(createDocumentCookieAccess, COOKIE_OPTIONS)
      expect(result).toBe(true)
    })

    it('works with the real createCookieStoreAccess', async (ctx) => {
      if (!globalObject.cookieStore) {
        ctx.skip(true, 'CookieStore API not available')
      }
      const result = await areCookiesAuthorized(createCookieStoreAccess, COOKIE_OPTIONS)
      expect(result).toBe(true)
    })

    it('returns false when document.cookie is empty', async () => {
      vi.spyOn(document, 'cookie', 'get').mockReturnValue('')
      const result = await areCookiesAuthorized(createDocumentCookieAccess, COOKIE_OPTIONS)
      expect(result).toBe(false)
    })
  })

  describe('isCookieStoreSupported', () => {
    it('returns false when the CookieStore API is not available', () => {
      disableCookieStore()

      expect(isCookieStoreSupported()).toBe(false)
    })

    it('returns true when the CookieStore API supports change events', () => {
      const cookieStore = new EventTarget()
      replaceMockable(globalObject.cookieStore, cookieStore as unknown as typeof globalObject.cookieStore)

      expect(isCookieStoreSupported()).toBe(true)
    })

    it('returns false when the CookieStore API does not support change events', () => {
      const cookieStore = {
        addEventListener: vi.fn().mockImplementation(() => {
          throw new Error('unsupported')
        }),
      }
      replaceMockable(globalObject.cookieStore, cookieStore as unknown as typeof globalObject.cookieStore)

      expect(isCookieStoreSupported()).toBe(false)
    })
  })
})
