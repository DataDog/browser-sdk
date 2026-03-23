import { mockClock, mockCookies, registerCleanupTask } from '../../../../test'
import { deleteCookie, getCookie } from '../../../browser/cookie'
import type { SessionState } from '../sessionState'
import type { Configuration, InitConfiguration } from '../../configuration'
import { WATCH_COOKIE_INTERVAL_DELAY } from '../../../browser/cookieObservable'
import { SESSION_COOKIE_EXPIRATION_DELAY, SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from '../sessionConstants'
import { buildCookieOptions, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'abc', trackAnonymousUser: true }

/**
 * Disable the CookieStore API so the cookie observable falls back to polling.
 * This makes the tests deterministic since we can control time with mockClock.
 */
function disableCookieStore() {
  const original = Object.getOwnPropertyDescriptor(window, 'cookieStore')
  Object.defineProperty(window, 'cookieStore', { get: () => undefined, configurable: true })
  registerCleanupTask(() => {
    if (original) {
      Object.defineProperty(window, 'cookieStore', original)
    }
  })
}

function setupCookieStrategy(partialInitConfiguration: Partial<InitConfiguration> = {}) {
  const initConfiguration = {
    ...DEFAULT_INIT_CONFIGURATION,
    ...partialInitConfiguration,
  } as InitConfiguration

  const cookieOptions = buildCookieOptions(initConfiguration)!
  const configuration = { trackAnonymousUser: initConfiguration.trackAnonymousUser ?? true } as Configuration

  registerCleanupTask(() => deleteCookie(SESSION_STORE_KEY, cookieOptions))

  return {
    strategy: initCookieStrategy(cookieOptions, configuration),
    cookieOptions,
  }
}

describe('session in cookie strategy', () => {
  let clock: ReturnType<typeof mockClock>

  beforeEach(() => {
    disableCookieStore()
    clock = mockClock()
  })

  describe('setSessionState', () => {
    it('should read cookie, apply fn, and write back', async () => {
      const { strategy } = setupCookieStrategy()

      await strategy.setSessionState((state) => ({ ...state, id: 'abc123' }))

      expect(getCookie(SESSION_STORE_KEY)).toContain('id=abc123')
    })

    it('should start with empty state when nothing stored', async () => {
      const { strategy } = setupCookieStrategy()

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return { ...state, id: 'new-id' }
      })

      expect(capturedState).toEqual({})
    })

    it('should read existing state from cookie', async () => {
      const { strategy } = setupCookieStrategy()

      await strategy.setSessionState(() => ({ id: 'existing', created: '0' }))

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState!.id).toBe('existing')
    })

    it('should add c=xxx to cookie on write', async () => {
      const { strategy } = setupCookieStrategy()

      await strategy.setSessionState(() => ({ id: 'abc' }))

      const cookieValue = getCookie(SESSION_STORE_KEY)
      expect(cookieValue).toContain('c=0')
    })

    it('should strip c from state passed to fn', async () => {
      const { strategy } = setupCookieStrategy()

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return { ...state, id: 'test' }
      })

      expect(capturedState!.c).toBeUndefined()
    })

    it('should strip c from state emitted via observable', async () => {
      const { strategy } = setupCookieStrategy()
      const spy = jasmine.createSpy<(state: SessionState) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      await strategy.setSessionState(() => ({ id: 'test' }))
      clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'test' }))
      expect(spy.calls.mostRecent().args[0].c).toBeUndefined()
    })

    it('should not write c to cookie when state is empty (deletes cookie)', async () => {
      const { strategy } = setupCookieStrategy()

      await strategy.setSessionState(() => ({}))

      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('should notify sessionObservable after write', async () => {
      const { strategy } = setupCookieStrategy()
      const spy = jasmine.createSpy('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      await strategy.setSessionState((state) => ({ ...state, id: 'test-id' }))
      clock.tick(WATCH_COOKIE_INTERVAL_DELAY)

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'test-id' }))
    })

    it('should queue setSessionState calls and process them sequentially', async () => {
      const { strategy } = setupCookieStrategy()
      const calls: string[] = []

      void strategy.setSessionState((state) => {
        calls.push('first')
        return { ...state, id: 'first' }
      })

      await strategy.setSessionState((state) => {
        calls.push('second')
        return { ...state, id: 'second' }
      })

      expect(calls).toEqual(['first', 'second'])
      expect(getCookie(SESSION_STORE_KEY)).toContain('id=second')
    })
  })

  describe('cookie options matching', () => {
    it('should match the cookie by c=xxx when multiple cookies exist', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('_dd_s=id=123&c=0;_dd_s=id=456&c=1;_dd_s=id=789&c=2')

      const { strategy } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      let capturedState: SessionState = {}
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState.id).toBe('456')
    })

    it('should return state from first cookie if there is no match', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('_dd_s=id=123&c=0;_dd_s=id=789&c=2')

      const { strategy } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      let capturedState: SessionState = {}
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState.id).toBe('123')
    })
  })

  describe('cookie expiration', () => {
    it('should use 1 year expiration when trackAnonymousUser=true', async () => {
      const { strategy } = setupCookieStrategy({ trackAnonymousUser: true })
      const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')

      await strategy.setSessionState(() => ({ id: '123', created: '0' }))

      expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(
        new Date(clock.timeStamp(SESSION_COOKIE_EXPIRATION_DELAY)).toUTCString()
      )
    })

    it('should use 15 min expiration for active session when trackAnonymousUser=false', async () => {
      const { strategy } = setupCookieStrategy({ trackAnonymousUser: false })
      const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')

      await strategy.setSessionState(() => ({ id: '123', created: '0' }))

      expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(
        new Date(clock.timeStamp(SESSION_EXPIRATION_DELAY)).toUTCString()
      )
    })

    it('should use 4h expiration for expired session when trackAnonymousUser=false', async () => {
      const { strategy } = setupCookieStrategy({ trackAnonymousUser: false })
      const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')

      await strategy.setSessionState(() => ({ isExpired: '1' }))

      expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(
        new Date(clock.timeStamp(SESSION_TIME_OUT_DELAY)).toUTCString()
      )
    })
  })

  describe('build cookie options', () => {
    const clientToken = 'abc'

    it('should not be secure nor crossSite by default', () => {
      const cookieOptions = buildCookieOptions({ clientToken })
      expect(cookieOptions).toEqual({ secure: false, crossSite: false, partitioned: false })
    })

    it('should be secure when `useSecureSessionCookie` is truthy', () => {
      const cookieOptions = buildCookieOptions({ clientToken, useSecureSessionCookie: true })
      expect(cookieOptions).toEqual({ secure: true, crossSite: false, partitioned: false })
    })

    it('should be secure, crossSite and partitioned when `usePartitionedCrossSiteSessionCookie` is truthy', () => {
      const cookieOptions = buildCookieOptions({ clientToken, usePartitionedCrossSiteSessionCookie: true })
      expect(cookieOptions).toEqual({ secure: true, crossSite: true, partitioned: true })
    })

    it('should have domain when `trackSessionAcrossSubdomains` is truthy', () => {
      const cookieOptions = buildCookieOptions({ clientToken, trackSessionAcrossSubdomains: true })
      expect(cookieOptions).toEqual({
        secure: false,
        crossSite: false,
        partitioned: false,
        domain: jasmine.any(String),
      })
    })
  })

  describe('selectCookieStrategy', () => {
    it('should return defined when cookies are authorized', () => {
      mockCookies()
      const strategy = selectCookieStrategy({ clientToken: 'abc' })
      expect(strategy).toBeDefined()
    })
  })

  describe('c=xxx encoding', () => {
    it('should encode cookie options in the cookie value', async () => {
      const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
      const { strategy } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({ id: '123' }))

      const calls = cookieSetSpy.calls.all()
      const lastCall = calls[calls.length - 1]
      expect(lastCall.args[0]).toMatch(/^_dd_s=id=123&c=1/)
    })

    it('should not encode cookie options in the cookie value if the session is empty', async () => {
      const { strategy } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({}))

      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })
})
