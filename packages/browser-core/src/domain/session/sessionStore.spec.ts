import { vi, describe, expect, it } from 'vitest'
import { replaceMockable } from '../../../test'
import type { CookieStoreWindow } from '../../browser/browser.types'
import type { Configuration, InitConfiguration } from '../configuration'
import { buildCookieOptions } from '../configuration'
import { display } from '../../tools/display'
import { selectSessionStoreStrategyType } from './sessionStore'
import { SessionPersistence } from './sessionConstants'

const DEFAULT_INIT_CONFIGURATION: InitConfiguration = { clientToken: 'abc' }

function makeConfiguration(initConfiguration: InitConfiguration): Configuration {
  return {
    cookieOptions: buildCookieOptions(initConfiguration),
    sessionPersistence: initConfiguration.sessionPersistence,
  } as Configuration
}

describe('session store', () => {
  describe('selectSessionStoreStrategyType', () => {
    describe('sessionPersistence: cookie (default)', () => {
      it('returns cookie strategy when cookies are available', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration(DEFAULT_INIT_CONFIGURATION)
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('returns undefined when cookies are not available', async () => {
        disableCookies()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration(DEFAULT_INIT_CONFIGURATION)
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('returns cookie strategy when sessionPersistence is cookie', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: SessionPersistence.COOKIE })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.COOKIE }))
      })
    })

    describe('sessionPersistence: local-storage', () => {
      it('returns local storage strategy when sessionPersistence is local storage', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: SessionPersistence.LOCAL_STORAGE })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined when local storage is not available', async () => {
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: SessionPersistence.LOCAL_STORAGE })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })
    })

    describe('sessionPersistence: memory', () => {
      it('returns memory strategy when sessionPersistence is memory', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: SessionPersistence.MEMORY })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.MEMORY }))
      })
    })

    it('returns undefined when sessionPersistence is invalid', async () => {
      const displayErrorSpy = vi.spyOn(display, 'error')

      const sessionStoreStrategyType = await selectSessionStoreStrategyType(
        makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: 'invalid' as SessionPersistence })
      )
      expect(sessionStoreStrategyType).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledTimes(1)
      expect(displayErrorSpy).toHaveBeenCalledWith("Invalid session persistence 'invalid'")
    })

    describe('sessionPersistence as array', () => {
      it('returns the first available strategy from the array', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('falls back to next strategy when first is unavailable', async () => {
        disableCookies()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('falls back to memory when cookie and local storage are unavailable', async () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: [
              SessionPersistence.COOKIE,
              SessionPersistence.LOCAL_STORAGE,
              SessionPersistence.MEMORY,
            ],
          })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.MEMORY }))
      })

      it('returns undefined when no strategy in array is available', async () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
          })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles empty array', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: [] })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles array with single element', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionPersistence: [SessionPersistence.LOCAL_STORAGE] })
        )
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('stops at first available strategy and does not try subsequent ones', async () => {
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: [SessionPersistence.LOCAL_STORAGE, SessionPersistence.COOKIE],
          })
        )
        // Should return local storage (first available), not cookie
        expect(sessionStoreStrategyType).toEqual(expect.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined and logs error if array contains invalid persistence type', async () => {
        const displayErrorSpy = vi.spyOn(display, 'error')
        const sessionStoreStrategyType = await selectSessionStoreStrategyType(
          makeConfiguration({
            ...DEFAULT_INIT_CONFIGURATION,
            sessionPersistence: ['invalid'] as unknown as SessionPersistence[],
          })
        )
        expect(sessionStoreStrategyType).toBeUndefined()
        expect(displayErrorSpy).toHaveBeenCalledTimes(1)
        expect(displayErrorSpy).toHaveBeenCalledWith("Invalid session persistence 'invalid'")
      })
    })

    function disableCookies() {
      vi.spyOn(document, 'cookie', 'get').mockReturnValue('')
      replaceMockable((window as CookieStoreWindow).cookieStore, undefined)
    }
    function disableLocalStorage() {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('unavailable')
      })
    }
  })
})
