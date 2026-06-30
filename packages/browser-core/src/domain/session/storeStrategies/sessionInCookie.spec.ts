import { vi, beforeEach, describe, expect, it } from 'vitest'
import { registerCleanupTask, replaceMockable, mockCookies, collectAsyncCalls } from '../../../../test'
import { Observable } from '../../../tools/observable'
import type { SessionState } from '../sessionState'
import type { Configuration, InitConfiguration } from '../../configuration'
import { buildCookieOptions } from '../../configuration'
import { SESSION_COOKIE_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from '../sessionConstants'
import { CookieApi, LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'
import { createCookieAccess, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'

// Safari on BrowserStack cannot access cookies because vitest runs tests in an iframe
// and BrowserStack replaces localhost with bs-local.com, triggering Safari's ITP restrictions.
// https://www.browserstack.com/support/faq/local-testing/local-exceptions/i-face-issues-while-testing-localhost-urls-or-private-servers-in-safari-on-macos-os-x-and-ios
beforeEach((ctx) => {
  ctx.skip(navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome'), 'Safari on BrowserStack')
})

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'abc', trackAnonymousUser: true }

function createMockCookieAccess() {
  let storedValues: string[] = []
  let lastExpireDelay: number | undefined
  const observable = new Observable<void>()

  return {
    mockCookieAccess: {
      getAll(): Promise<string[]> {
        return Promise.resolve(storedValues)
      },
      getAllAndSet(cb: (values: string[]) => { value: string; expireDelay: number }): Promise<void> {
        const { value, expireDelay } = cb(storedValues)
        storedValues = value ? [value] : []
        lastExpireDelay = expireDelay
        observable.notify()
        return Promise.resolve()
      },
      observable,
    },
    mockCookie: {
      getStoredValues: () => storedValues,
      getLastExpireDelay: () => lastExpireDelay,
      simulateExternalChange: (value: string) => {
        storedValues = value ? [value] : []
        observable.notify()
      },
      setAllValues: (values: string[]) => {
        storedValues = values
      },
    },
  }
}

function setupCookieStrategy(partialInitConfiguration: Partial<InitConfiguration> = {}) {
  const initConfiguration = {
    ...DEFAULT_INIT_CONFIGURATION,
    ...partialInitConfiguration,
  } as InitConfiguration

  const cookieOptions = buildCookieOptions(initConfiguration)!
  const configuration = { trackAnonymousUser: initConfiguration.trackAnonymousUser ?? true } as Configuration

  const { mockCookieAccess, mockCookie } = createMockCookieAccess()
  replaceMockable(createCookieAccess, () => mockCookieAccess)
  const cookiesMock = mockCookies()

  return {
    strategy: initCookieStrategy(
      { type: 'cookie', cookieOptions, cookieApi: CookieApi.DOCUMENT_COOKIE },
      configuration
    ),
    cookieOptions,
    mockCookie,
    cookiesMock,
  }
}

describe('session in cookie strategy', () => {
  describe('setSessionState', () => {
    it('should read cookie, apply fn, and write back', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()

      await strategy.setSessionState((state) => ({ ...state, id: 'abc123' }), 'updateState')

      expect(mockCookie.getStoredValues()[0]).toContain('id=abc123')
    })

    it('should start with empty state when nothing stored', async () => {
      const { strategy } = setupCookieStrategy()

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return { ...state, id: 'new-id' }
      }, 'updateState')

      expect(capturedState).toEqual({})
    })

    it('should read existing state from cookie', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState!.id).toBe('123')
    })

    it('should add c=xxx to cookie on write', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()

      await strategy.setSessionState(() => ({ id: 'abc' }), 'updateState')

      expect(mockCookie.getStoredValues()[0]).toContain('c=0')
    })

    it('should strip c from state passed to fn', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return { ...state, id: 'test' }
      }, 'updateState')

      expect(capturedState!.c).toBeUndefined()
    })

    it('should not write c to cookie when state is empty (deletes cookie)', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      await strategy.setSessionState(() => ({}), 'updateState')

      expect(mockCookie.getStoredValues()).toEqual([])
    })

    it('should strip c from state emitted via observable', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = vi.fn()
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      mockCookie.simulateExternalChange('id=test&c=0')
      await collectAsyncCalls(spy, 1)

      expect(spy.mock.lastCall![0].c).toBeUndefined()
    })

    it('should notify observable when cookie is cleared', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = vi.fn()
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      mockCookie.simulateExternalChange('')
      await collectAsyncCalls(spy, 1)

      expect(spy.mock.lastCall![0]).toEqual({})
    })

    it('should notify sessionObservable after write', async () => {
      const { strategy } = setupCookieStrategy()
      const spy = vi.fn()
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      await strategy.setSessionState(() => ({ id: '123' }), 'updateState')
      await collectAsyncCalls(spy, 1)

      expect(spy.mock.lastCall![0]).toEqual({ id: '123' })
    })

    it('should queue setSessionState calls and process them sequentially', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const calls: string[] = []

      void strategy.setSessionState((state) => {
        calls.push('first')
        return { ...state, id: 'first' }
      }, 'updateState')

      await strategy.setSessionState((state) => {
        calls.push('second')
        return { ...state, id: 'second' }
      }, 'updateState')

      expect(calls).toEqual(['first', 'second'])
      expect(mockCookie.getStoredValues()[0]).toContain('id=second')
    })
  })

  describe('cookie options matching', () => {
    it('should match the cookie by c=xxx when multiple cookies exist', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })
      mockCookie.setAllValues(['id=123&c=0', 'id=456&c=1', 'id=789&c=2'])

      let capturedState: SessionState = {}
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState.id).toBe('456')
    })

    it('should return state from first cookie if there is no match', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=1', 'id=789&c=2'])

      let capturedState: SessionState = {}
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState.id).toBe('123')
    })
  })

  describe('cookie expiration', () => {
    it('should use 1 year expiration when trackAnonymousUser=true', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ trackAnonymousUser: true })

      await strategy.setSessionState(() => ({ id: '123', created: '0' }), 'updateState')

      expect(mockCookie.getLastExpireDelay()).toBe(SESSION_COOKIE_EXPIRATION_DELAY)
    })

    it('should use 4h expiration when trackAnonymousUser=false', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ trackAnonymousUser: false })

      await strategy.setSessionState(() => ({ id: '123', created: '0' }), 'updateState')

      expect(mockCookie.getLastExpireDelay()).toBe(SESSION_TIME_OUT_DELAY)
    })
  })

  describe('selectCookieStrategy', () => {
    it('should return defined when cookies are authorized', () => {
      mockCookies()
      const strategy = selectCookieStrategy({ clientToken: 'abc' } as Configuration)
      expect(strategy).toBeDefined()
    })
  })

  describe('migration from legacy cookie', () => {
    function setLegacyCookie(cookiesMock: ReturnType<typeof mockCookies>, value: string) {
      cookiesMock.getCookies().push({
        name: LEGACY_SESSION_STORE_KEY,
        value,
        expires: Date.now() + 60_000,
      })
    }

    it('should read from legacy cookie on first call when new cookie is empty', async () => {
      const { strategy, cookiesMock } = setupCookieStrategy()
      setLegacyCookie(cookiesMock, 'id=legacy-id&created=123&c=0')

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState!.id).toBe('legacy-id')
      expect(capturedState!.created).toBe('123')
    })

    it('should not read from legacy cookie when new cookie has data', async () => {
      const { strategy, mockCookie, cookiesMock } = setupCookieStrategy()
      setLegacyCookie(cookiesMock, 'id=legacy-id&c=0')
      mockCookie.setAllValues(['id=new-id&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState!.id).toBe('new-id')
    })

    it('should not read from legacy cookie on subsequent calls', async () => {
      const { strategy, mockCookie, cookiesMock } = setupCookieStrategy()
      setLegacyCookie(cookiesMock, 'id=legacy-id&c=0')

      // First call triggers migration
      await strategy.setSessionState((state) => state, 'updateState')

      // Clear the new cookie to simulate empty state
      mockCookie.setAllValues([])

      // Second call should not read from legacy cookie
      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState).toEqual({})
    })
  })

  describe('c=xxx encoding', () => {
    it('should encode cookie options in the cookie value', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({ id: '123' }), 'updateState')

      expect(mockCookie.getStoredValues()[0]).toMatch(/^id=123&c=1/)
    })

    it('should not encode cookie options in the cookie value if the session is empty', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({}), 'updateState')

      expect(mockCookie.getStoredValues()).toEqual([])
    })
  })
})
