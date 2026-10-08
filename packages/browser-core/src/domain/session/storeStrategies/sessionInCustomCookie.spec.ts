import { createFakeCustomCookieStore, mockBaseConfiguration, mockCookies } from '../../../../test'
import type { SessionState } from '../sessionState'
import { LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'
import { initCustomCookieStrategy, selectCustomCookieStrategy } from './sessionInCustomCookie'

describe('session in custom cookie strategy', () => {
  describe('selectCustomCookieStrategy', () => {
    it('returns the custom cookie strategy when the cookie store works, without using document.cookie', async () => {
      const { cookieStore } = createFakeCustomCookieStore()
      const documentCookieGetSpy = spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const documentCookieSetSpy = spyOnProperty(document, 'cookie', 'set')

      const strategyType = await selectCustomCookieStrategy(cookieStore, mockBaseConfiguration())

      expect(strategyType).toEqual({ type: 'custom-cookie', cookieOptions: jasmine.any(Object), cookieStore })
      expect(documentCookieGetSpy).not.toHaveBeenCalled()
      expect(documentCookieSetSpy).not.toHaveBeenCalled()
    })

    it('returns undefined when the cookie store cannot write', async () => {
      const { cookieStore } = createFakeCustomCookieStore()
      cookieStore.get.and.returnValue(Promise.resolve(''))

      const strategyType = await selectCustomCookieStrategy(cookieStore, mockBaseConfiguration())

      expect(strategyType).toBeUndefined()
    })
  })

  describe('initCustomCookieStrategy', () => {
    it('persists the session through the cookie store', async () => {
      const { cookies, cookieStore } = createFakeCustomCookieStore()

      const strategy = initCustomCookieStrategy(
        { type: 'custom-cookie', cookieOptions: {}, cookieStore },
        mockBaseConfiguration()
      )
      await strategy.setSessionState((state) => ({ ...state, id: 'abc' }), 'updateState')

      expect(cookies.get('_dd_s_v2')).toContain('id=abc')
    })

    it('does not read the legacy cookie', async () => {
      const { cookieStore } = createFakeCustomCookieStore()
      mockCookies()
        .getCookies()
        .push({
          name: LEGACY_SESSION_STORE_KEY,
          value: 'id=legacy-id&created=123&c=0',
          expires: Date.now() + 60_000,
        })
      const strategy = initCustomCookieStrategy(
        { type: 'custom-cookie', cookieOptions: {}, cookieStore },
        mockBaseConfiguration()
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
