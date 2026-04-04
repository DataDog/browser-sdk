import type { SessionState } from '@datadog/core-next'
import { deleteCookie, getCookie } from '../../browser/cookie'
import { CookieStore } from './cookieStore'

const SESSION_COOKIE_NAME = '_dd_s'

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session-1',
    deviceId: 'device-1',
    created: 1000,
    lastActivity: 2000,
    ...overrides,
  }
}

describe('CookieStore', () => {
  beforeEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
  })

  afterEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
  })

  describe('get()', () => {
    it('returns undefined when no session cookie exists', async () => {
      const store = new CookieStore()

      expect(await store.get()).toBeUndefined()
    })

    it('returns the stored state after set()', async () => {
      const store = new CookieStore()
      const state = makeState()

      await store.set(state)

      expect(await store.get()).toEqual(state)
    })

    it('returns undefined when cookie contains invalid JSON', async () => {
      // Write a malformed cookie directly
      document.cookie = `${SESSION_COOKIE_NAME}=not-valid-json;path=/`
      const store = new CookieStore()

      expect(await store.get()).toBeUndefined()
    })
  })

  describe('set()', () => {
    it('writes session state as a JSON cookie readable by get()', async () => {
      const store = new CookieStore()
      const state = makeState()

      await store.set(state)

      const raw = getCookie(SESSION_COOKIE_NAME)
      expect(raw).toBe(JSON.stringify(state))
    })

    it('uses Web Locks when navigator.locks is available', async () => {
      const store = new CookieStore()
      const state = makeState()

      const requestSpy = spyOn(navigator.locks, 'request').and.callThrough()

      await store.set(state)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(requestSpy as any).toHaveBeenCalledWith('dd_session_lock', jasmine.any(Function))
    })

    it('falls back to direct write when navigator.locks is unavailable', async () => {
      const originalLocks = navigator.locks

      // Remove navigator.locks
      Object.defineProperty(navigator, 'locks', {
        value: undefined,
        configurable: true,
        writable: true,
      })

      try {
        const store = new CookieStore()
        const state = makeState()

        await store.set(state)

        expect(await store.get()).toEqual(state)
      } finally {
        Object.defineProperty(navigator, 'locks', {
          value: originalLocks,
          configurable: true,
          writable: true,
        })
      }
    })
  })

  describe('clear()', () => {
    it('deletes the session cookie', async () => {
      const store = new CookieStore()

      await store.set(makeState())
      expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()

      await store.clear()

      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    })

    it('returns undefined from get() after clear()', async () => {
      const store = new CookieStore()

      await store.set(makeState())
      await store.clear()

      expect(await store.get()).toBeUndefined()
    })
  })

  describe('onExternalChange() — polling fallback', () => {
    let originalCookieStore: any

    beforeEach(() => {
      // Remove CookieStore API to force polling path
      originalCookieStore = (window as any).cookieStore
      delete (window as any).cookieStore
    })

    afterEach(() => {
      if (originalCookieStore !== undefined) {
        ;(window as any).cookieStore = originalCookieStore
      }
    })

    it('fires callback when the cookie changes externally', (done) => {
      const store = new CookieStore()

      const unsubscribe = store.onExternalChange(() => {
        unsubscribe()
        done()
      })

      // Simulate external change after a tick
      setTimeout(() => {
        document.cookie = `${SESSION_COOKIE_NAME}=${JSON.stringify(makeState({ id: 'external' }))};path=/`
      }, 100)
    })

    it('returns an unsubscribe function that stops polling', (done) => {
      const store = new CookieStore()
      const callback = jasmine.createSpy('callback')

      const unsubscribe = store.onExternalChange(callback)
      unsubscribe()

      // Change cookie after unsubscribe — callback should not fire
      setTimeout(() => {
        document.cookie = `${SESSION_COOKIE_NAME}=${JSON.stringify(makeState({ id: 'after-unsub' }))};path=/`
      }, 100)

      // Wait long enough for a poll cycle (> 1000ms)
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled()
        done()
      }, 1200)
    })
  })
})
