import type { InitConfiguration } from '../configuration'
import { display } from '../../tools/display'
import { selectSessionStoreStrategyType } from './sessionStore'
import { SessionPersistence } from './sessionConstants'

const DEFAULT_INIT_CONFIGURATION: InitConfiguration = { clientToken: 'abc' }

describe('session store', () => {
  describe('selectSessionStoreStrategyType', () => {
    describe('sessionPersistence: cookie (default)', () => {
      it('returns cookie strategy when cookies are available', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('returns undefined when cookies are not available', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('returns cookie strategy when sessionPersistence is cookie', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.COOKIE,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })
    })

    describe('sessionPersistence: local-storage', () => {
      it('returns local storage strategy when sessionPersistence is local storage', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.LOCAL_STORAGE,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined when local storage is not available', () => {
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.LOCAL_STORAGE,
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })
    })

    describe('sessionPersistence: memory', () => {
      it('returns memory strategy when sessionPersistence is memory', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.MEMORY,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })
    })

    it('returns undefined when sessionPersistence is invalid', () => {
      const displayErrorSpy = spyOn(display, 'error')

      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        ...DEFAULT_INIT_CONFIGURATION,
        sessionPersistence: 'invalid' as SessionPersistence,
      })
      expect(sessionStoreStrategyType).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
    })

    describe('sessionPersistence as array', () => {
      it('returns the first available strategy from the array', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('falls back to next strategy when first is unavailable', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('falls back to memory when cookie and local storage are unavailable', () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE, SessionPersistence.MEMORY],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })

      it('returns undefined when no strategy in array is available', () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles empty array', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles array with single element', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('stops at first available strategy and does not try subsequent ones', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.LOCAL_STORAGE, SessionPersistence.COOKIE],
        })
        // Should return local storage (first available), not cookie
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined and logs error if array contains invalid persistence type', () => {
        const displayErrorSpy = spyOn(display, 'error')
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: ['invalid' as SessionPersistence],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
        expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
      })
    })

    function disableCookies() {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
    }
    function disableLocalStorage() {
      spyOn(Storage.prototype, 'getItem').and.throwError('unavailable')
    }
  })
})
