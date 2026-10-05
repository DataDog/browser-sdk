import { mockBaseConfiguration, mockCookies } from '../../../../test'
import { Observable } from '../../../tools/observable'
import type { CookieAccess } from '../../../browser/cookieAccess'
import type { SessionState } from '../sessionState'
import { LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'
import { initCustomStrategy, selectCustomStrategy } from './sessionInCustomStore'

function createMockCookieAccess(): CookieAccess & { values: string[] } {
  return {
    values: [],
    getAll() {
      return Promise.resolve(this.values)
    },
    getAllAndSet(cb) {
      const { value } = cb(this.values)
      this.values = value ? [value] : []
      return Promise.resolve()
    },
    delete() {
      this.values = []
      return Promise.resolve()
    },
    observable: new Observable<void>(),
  }
}

describe('session in custom store strategy', () => {
  describe('selectCustomStrategy', () => {
    it('returns the custom strategy when the session cookie access works, without using document.cookie', async () => {
      const documentCookieGetSpy = spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const documentCookieSetSpy = spyOnProperty(document, 'cookie', 'set')
      const cookieAccess = createMockCookieAccess()

      const strategyType = await selectCustomStrategy(
        mockBaseConfiguration({ sessionCookieAccess: () => cookieAccess })
      )

      expect(strategyType).toEqual({ type: 'custom', cookieOptions: jasmine.any(Object) })
      expect(documentCookieGetSpy).not.toHaveBeenCalled()
      expect(documentCookieSetSpy).not.toHaveBeenCalled()
    })

    it('returns undefined when the session cookie access cannot write', async () => {
      const cookieAccess = createMockCookieAccess()
      cookieAccess.getAll = () => Promise.resolve([])

      const strategyType = await selectCustomStrategy(
        mockBaseConfiguration({ sessionCookieAccess: () => cookieAccess })
      )

      expect(strategyType).toBeUndefined()
    })
  })

  describe('initCustomStrategy', () => {
    it('persists the session through the session cookie access', async () => {
      const cookieAccess = createMockCookieAccess()
      const sessionCookieAccess = jasmine.createSpy('sessionCookieAccess').and.returnValue(cookieAccess)
      const cookieOptions = {}

      const strategy = initCustomStrategy(
        { type: 'custom', cookieOptions },
        mockBaseConfiguration({ sessionCookieAccess })
      )
      await strategy.setSessionState((state) => ({ ...state, id: 'abc' }), 'updateState')

      expect(sessionCookieAccess).toHaveBeenCalledOnceWith('_dd_s_v2', cookieOptions)
      expect(cookieAccess.values[0]).toContain('id=abc')
    })

    it('does not read the legacy cookie', async () => {
      mockCookies()
        .getCookies()
        .push({
          name: LEGACY_SESSION_STORE_KEY,
          value: 'id=legacy-id&created=123&c=0',
          expires: Date.now() + 60_000,
        })
      const cookieAccess = createMockCookieAccess()
      const strategy = initCustomStrategy(
        { type: 'custom', cookieOptions: {} },
        mockBaseConfiguration({ sessionCookieAccess: () => cookieAccess })
      )

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState).toEqual({})
    })
  })
})
