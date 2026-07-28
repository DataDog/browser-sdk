import { globalObject } from '@datadog/js-core/util'
import { mockBaseConfiguration, replaceMockable } from '../../../test'
import { display } from '../../tools/display'
import { selectSessionStoreStrategyType } from './sessionStore'
import { SessionPersistence } from './sessionConstants'

describe('session store', () => {
  describe('selectSessionStoreStrategyType', () => {
    describe('sessionPersistence: cookie (default)', () => {
      it('returns cookie strategy when cookies are available', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(mockBaseConfiguration())
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('returns undefined when cookies are not available', async () => {
        disableCookies()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(mockBaseConfiguration())
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('returns cookie strategy when sessionPersistence is cookie', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [SessionPersistence.COOKIE] })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })
    })

    describe('sessionPersistence: local-storage', () => {
      it('returns local storage strategy when sessionPersistence is local storage', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [SessionPersistence.LOCAL_STORAGE] })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined when local storage is not available', async () => {
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [SessionPersistence.LOCAL_STORAGE] })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })
    })

    describe('sessionPersistence: memory', () => {
      it('returns memory strategy when sessionPersistence is memory', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [SessionPersistence.MEMORY] })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })
    })

    it('returns undefined when sessionPersistence is invalid', async () => {
      const displayErrorSpy = spyOn(display, 'error')

      const sessionStoreStrategyType = await selectSessionStoreStrategyType(
        mockBaseConfiguration({ sessionPersistence: ['invalid'] as unknown as SessionPersistence[] })
      )
      expect(sessionStoreStrategyType).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
    })

    describe('sessionPersistence as array', () => {
      it('returns the first available strategy from the array', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('falls back to next strategy when first is unavailable', async () => {
        disableCookies()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('falls back to memory when cookie and local storage are unavailable', async () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: [
              SessionPersistence.COOKIE,
              SessionPersistence.LOCAL_STORAGE,
              SessionPersistence.MEMORY,
            ],
          })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })

      it('returns undefined when no strategy in array is available', async () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles empty array', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [] })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles array with single element', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({ sessionPersistence: [SessionPersistence.LOCAL_STORAGE] })
        )
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('stops at first available strategy and does not try subsequent ones', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: [SessionPersistence.LOCAL_STORAGE, SessionPersistence.COOKIE],
          })
        )
        // Should return local storage (first available), not cookie
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined and logs error if array contains invalid persistence type', async () => {
        const displayErrorSpy = spyOn(display, 'error')
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          mockBaseConfiguration({
            sessionPersistence: ['invalid'] as unknown as SessionPersistence[],
          })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
        expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
      })
    })

    function disableCookies() {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      replaceMockable(globalObject.cookieStore, undefined)
    }
    function disableLocalStorage() {
      spyOn(Storage.prototype, 'getItem').and.throwError('unavailable')
    }
  })
})
