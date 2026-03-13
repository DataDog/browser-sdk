import { registerCleanupTask } from '../../test'
import { deleteCookie, getCookie, setCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'
import { createCookieAccess } from './cookieAccess'

const COOKIE_NAME = 'test_cookie'
const COOKIE_OPTIONS = { secure: false, crossSite: false, partitioned: false }

describe('cookieAccess', () => {
  describe('document.cookie fallback', () => {
    beforeEach(() => {
      disableCookieStore()
    })

    it('should get a cookie value', async () => {
      setCookie(COOKIE_NAME, 'hello', 1000)
      registerCleanupTask(() => deleteCookie(COOKIE_NAME))

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      expect(await cookieAccess.get()).toBe('hello')
    })

    it('should return undefined when cookie does not exist', async () => {
      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      expect(await cookieAccess.get()).toBeUndefined()
    })

    it('should get all cookies with the same name', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue(`${COOKIE_NAME}=value1;${COOKIE_NAME}=value2`)

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      const items = await cookieAccess.getAll()
      expect(items.length).toBe(2)
      expect(items[0].value).toBe('value1')
      expect(items[1].value).toBe('value2')
    })

    it('should return items without domain/partitioned in fallback', async () => {
      setCookie(COOKIE_NAME, 'hello', 1000)
      registerCleanupTask(() => deleteCookie(COOKIE_NAME))

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      const items = await cookieAccess.getAll()
      expect(items[0].domain).toBeUndefined()
      expect(items[0].partitioned).toBeUndefined()
    })

    it('should set a cookie', async () => {
      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)
      registerCleanupTask(() => deleteCookie(COOKIE_NAME))

      await cookieAccess.set('world', 1000)

      expect(getCookie(COOKIE_NAME)).toBe('world')
    })

    it('should delete a cookie', async () => {
      setCookie(COOKIE_NAME, 'hello', 1000)

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      await cookieAccess.delete()

      expect(getCookie(COOKIE_NAME)).toBeUndefined()
    })
  })

  describe('CookieStore API', () => {
    let getSpy: jasmine.Spy
    let getAllSpy: jasmine.Spy
    let setSpy: jasmine.Spy
    let deleteSpy: jasmine.Spy

    beforeEach(() => {
      getSpy = jasmine.createSpy('get').and.returnValue(Promise.resolve(null))
      getAllSpy = jasmine.createSpy('getAll').and.returnValue(Promise.resolve([]))
      setSpy = jasmine.createSpy('set').and.returnValue(Promise.resolve())
      deleteSpy = jasmine.createSpy('delete').and.returnValue(Promise.resolve())

      enableMockCookieStore({
        get: getSpy,
        getAll: getAllSpy,
        set: setSpy,
        delete: deleteSpy,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
      } as unknown as CookieStoreWindow['cookieStore'])
    })

    it('should get a cookie value via cookieStore.get()', async () => {
      getSpy.and.returnValue(Promise.resolve({ name: COOKIE_NAME, value: 'hello' }))

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      const value = await cookieAccess.get()
      expect(value).toBe('hello')
      expect(getSpy).toHaveBeenCalledWith(COOKIE_NAME)
    })

    it('should return undefined when cookieStore.get() returns null', async () => {
      getSpy.and.returnValue(Promise.resolve(null))

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      const value = await cookieAccess.get()
      expect(value).toBeUndefined()
    })

    it('should get all cookies via cookieStore.getAll()', async () => {
      getAllSpy.and.returnValue(
        Promise.resolve([
          { name: COOKIE_NAME, value: 'v1', domain: '.example.com', partitioned: false },
          { name: COOKIE_NAME, value: 'v2', domain: '.other.com', partitioned: true },
        ])
      )

      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      const items = await cookieAccess.getAll()
      expect(items).toEqual([
        { value: 'v1', domain: '.example.com', partitioned: false },
        { value: 'v2', domain: '.other.com', partitioned: true },
      ])
    })

    it('should set a cookie via cookieStore.set() with correct options', async () => {
      const cookieAccess = createCookieAccess(COOKIE_NAME, {
        secure: true,
        crossSite: true,
        partitioned: true,
        domain: '.example.com',
      })

      const now = Date.now()
      await cookieAccess.set('myvalue', 60000)

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
      // Verify expires is approximately correct (within 100ms)
      const callArgs = setSpy.calls.mostRecent().args[0]
      expect(callArgs.expires).toBeGreaterThanOrEqual(now + 60000)
      expect(callArgs.expires).toBeLessThan(now + 60100)
    })

    it('should use sameSite strict when crossSite is false', async () => {
      const cookieAccess = createCookieAccess(COOKIE_NAME, COOKIE_OPTIONS)

      await cookieAccess.set('val', 1000)

      expect(setSpy).toHaveBeenCalledWith(jasmine.objectContaining({ sameSite: 'strict' }))
    })

    it('should delete a cookie via cookieStore.delete()', async () => {
      const cookieAccess = createCookieAccess(COOKIE_NAME, {
        secure: false,
        crossSite: false,
        partitioned: true,
        domain: '.example.com',
      })

      await cookieAccess.delete()

      expect(deleteSpy).toHaveBeenCalledWith({
        name: COOKIE_NAME,
        domain: '.example.com',
        path: '/',
        partitioned: true,
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
