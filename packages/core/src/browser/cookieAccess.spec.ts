import { registerCleanupTask } from '../../test'
import { deleteCookie, getCookie } from './cookie'
import { createCookieAccessor } from './cookieAccess'
import type { CookieAccessor } from './cookieAccess'

const COOKIE_NAME = 'test_cookie'

describe('cookieAccess', () => {
  let accessor: CookieAccessor

  describe('document.cookie fallback', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'cookieStore', { value: undefined, configurable: true, writable: true })
      accessor = createCookieAccessor({})
      registerCleanupTask(() => {
        deleteCookie(COOKIE_NAME)
        delete (globalThis as any).cookieStore
      })
    })

    it('should set a cookie', async () => {
      await accessor.set(COOKIE_NAME, 'hello', 60_000)
      expect(getCookie(COOKIE_NAME)).toBe('hello')
    })

    it('should get all cookies', async () => {
      await accessor.set(COOKIE_NAME, 'value1', 60_000)
      const values = await accessor.getAll(COOKIE_NAME)
      expect(values).toContain('value1')
    })

    it('should delete a cookie', async () => {
      await accessor.set(COOKIE_NAME, 'to_delete', 60_000)
      await accessor.delete(COOKIE_NAME)
      expect(getCookie(COOKIE_NAME)).toBeUndefined()
    })
  })
})
