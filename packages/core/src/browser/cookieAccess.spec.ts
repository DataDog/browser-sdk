import { mockClock, registerCleanupTask } from '../../test'
import type { Configuration } from '../domain/configuration'
import { deleteCookie, getCookie, setCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'
import { createCookieAccess, WATCH_COOKIE_INTERVAL_DELAY } from './cookieAccess'

const COOKIE_NAME = 'test_cookie'
const COOKIE_OPTIONS = { secure: false, crossSite: false, partitioned: false }
const MOCK_CONFIGURATION = { allowUntrustedEvents: true } as Configuration

describe('cookieAccess', () => {
  describe('document.cookie fallback', () => {
    let clock: ReturnType<typeof mockClock>

    beforeEach(() => {
      disableCookieStore()
      clock = mockClock()
    })

    describe('getAllAndSet', () => {
      it('should pass current cookie values to callback', async () => {
        setCookie(COOKIE_NAME, 'value1', 1000)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))

        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

        let capturedValues: string[] | undefined
        await cookieAccess.getAllAndSet((values) => {
          capturedValues = values
          return { value: 'new', expireDelay: 1000 }
        })

        expect(capturedValues).toEqual(['value1'])
      })

      it('should pass empty array when cookie does not exist', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

        let capturedValues: string[] | undefined
        await cookieAccess.getAllAndSet((values) => {
          capturedValues = values
          return { value: 'new', expireDelay: 1000 }
        })

        expect(capturedValues).toEqual([])
      })

      it('should write the value returned by the callback', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))

        await cookieAccess.getAllAndSet(() => ({ value: 'hello', expireDelay: 1000 }))

        expect(getCookie(COOKIE_NAME)).toBe('hello')
      })

      it('should notify the observable after writing', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        await cookieAccess.getAllAndSet(() => ({ value: 'written', expireDelay: 1000 }))

        expect(spy).toHaveBeenCalledOnceWith('written')
      })

      it('should not notify the observable if the value did not change', async () => {
        setCookie(COOKIE_NAME, 'same', 1000)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))

        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        await cookieAccess.getAllAndSet(() => ({ value: 'same', expireDelay: 1000 }))

        expect(spy).not.toHaveBeenCalled()
      })
    })

    describe('observable (polling)', () => {
      it('should notify when cookie is changed externally', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        setCookie(COOKIE_NAME, 'external', 1000)
        clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

        expect(spy).toHaveBeenCalledOnceWith('external')
      })

      it('should notify when cookie is deleted externally', async () => {
        setCookie(COOKIE_NAME, 'existing', 1000)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))

        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        deleteCookie(COOKIE_NAME)
        clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

        expect(spy).toHaveBeenCalledOnceWith(undefined)
      })

      it('should not notify when cookie value is unchanged', () => {
        setCookie(COOKIE_NAME, 'stable', 1000)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))

        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

        expect(spy).not.toHaveBeenCalled()
      })
    })
  })

  describe('CookieStore API', () => {
    let getAllSpy: jasmine.Spy
    let setSpy: jasmine.Spy
    let changeListeners: Array<(event: any) => void>
    let mockCookieStore: CookieStoreWindow['cookieStore']

    beforeEach(() => {
      changeListeners = []
      getAllSpy = jasmine.createSpy('getAll').and.returnValue(Promise.resolve([]))
      setSpy = jasmine.createSpy('set').and.returnValue(Promise.resolve())

      mockCookieStore = {
        getAll: getAllSpy,
        set: setSpy,
        addEventListener: jasmine.createSpy('addEventListener').and.callFake((_event: string, listener: any) => {
          changeListeners.push(listener)
        }),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
      } as unknown as CookieStoreWindow['cookieStore']

      enableMockCookieStore(mockCookieStore)
    })

    describe('getAllAndSet', () => {
      it('should pass all cookie values to callback', async () => {
        getAllSpy.and.returnValue(
          Promise.resolve([
            { name: COOKIE_NAME, value: 'v1' },
            { name: COOKIE_NAME, value: 'v2' },
          ])
        )

        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

        let capturedValues: string[] | undefined
        await cookieAccess.getAllAndSet((values) => {
          capturedValues = values
          return { value: 'new', expireDelay: 1000 }
        })

        expect(capturedValues).toEqual(['v1', 'v2'])
      })

      it('should write via cookieStore.set() with correct options', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, {
          secure: true,
          crossSite: true,
          partitioned: true,
          domain: '.example.com',
        })

        const now = Date.now()
        await cookieAccess.getAllAndSet(() => ({ value: 'myvalue', expireDelay: 60000 }))

        expect(setSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            name: COOKIE_NAME,
            value: 'myvalue',
            path: '/',
            sameSite: 'none',
            domain: '.example.com',
            secure: true,
            partitioned: true,
          })
        )
        const callArgs = setSpy.calls.mostRecent().args[0]
        expect(callArgs.expires).toBeGreaterThanOrEqual(now + 60000)
        expect(callArgs.expires).toBeLessThan(now + 60100)
      })

      it('should use sameSite strict when crossSite is false', async () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)

        await cookieAccess.getAllAndSet(() => ({ value: 'val', expireDelay: 1000 }))

        expect(setSpy).toHaveBeenCalledWith(jasmine.objectContaining({ sameSite: 'strict' }))
      })
    })

    describe('observable (CookieStore events)', () => {
      it('should notify when a change event fires', () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        changeListeners.forEach((listener) =>
          listener({ changed: [{ name: COOKIE_NAME, value: 'updated' }], deleted: [] })
        )

        expect(spy).toHaveBeenCalledOnceWith('updated')
      })

      it('should notify with undefined when a delete event fires', () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        changeListeners.forEach((listener) =>
          listener({ changed: [], deleted: [{ name: COOKIE_NAME, value: undefined }] })
        )

        expect(spy).toHaveBeenCalledOnceWith(undefined)
      })

      it('should not notify for changes to a different cookie', () => {
        const cookieAccess = createCookieAccess(COOKIE_NAME, MOCK_CONFIGURATION, COOKIE_OPTIONS)
        const spy = jasmine.createSpy<(value: string | undefined) => void>('observer')
        const subscription = cookieAccess.observable.subscribe(spy)
        registerCleanupTask(() => subscription.unsubscribe())

        changeListeners.forEach((listener) =>
          listener({ changed: [{ name: 'other_cookie', value: 'whatever' }], deleted: [] })
        )

        expect(spy).not.toHaveBeenCalled()
      })
    })
  })
})

function disableCookieStore() {
  const original = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  Object.defineProperty(window, 'cookieStore', { get: () => undefined, configurable: true })
  registerCleanupTask(() => {
    if (original) {
      Object.defineProperty(window, 'cookieStore', original)
    }
  })
}

function enableMockCookieStore(mockStore: CookieStoreWindow['cookieStore']) {
  const original = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  Object.defineProperty(window, 'cookieStore', { get: () => mockStore, configurable: true })
  registerCleanupTask(() => {
    if (original) {
      Object.defineProperty(window, 'cookieStore', original)
    }
  })
}
