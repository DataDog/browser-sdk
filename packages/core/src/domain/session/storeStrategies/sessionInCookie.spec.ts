import { registerCleanupTask, replaceMockable, mockCookies } from '../../../../test'
import { createCookieAccess } from '../../../browser/cookieAccess'
import { Observable } from '../../../tools/observable'
import type { SessionState } from '../sessionState'
import type { Configuration, InitConfiguration } from '../../configuration'
import { SESSION_COOKIE_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from '../sessionConstants'
import type { SessionObservableEvent } from './sessionStoreStrategy'
import { LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'
import { buildCookieOptions, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'abc', trackAnonymousUser: true }

function createMockCookieAccess() {
  let storedValues: string[] = []
  let lastExpireDelay: number | undefined
  const observable = new Observable<string | undefined>()

  return {
    mockCookieAccess: {
      getAllAndSet(cb: (values: string[]) => { value: string; expireDelay: number }): Promise<void> {
        const { value, expireDelay } = cb(storedValues)
        storedValues = value ? [value] : []
        lastExpireDelay = expireDelay
        observable.notify(value)
        return Promise.resolve()
      },
      observable,
    },
    mockCookie: {
      getStoredValues: () => storedValues,
      getLastExpireDelay: () => lastExpireDelay,
      simulateExternalChange: (value: string) => {
        storedValues = value ? [value] : []
        observable.notify(value)
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

  return {
    strategy: initCookieStrategy(cookieOptions, configuration),
    cookieOptions,
    mockCookie,
  }
}

describe('session in cookie strategy', () => {
  describe('setSessionState', () => {
    it('should read cookie, apply fn, and write back', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()

      await strategy.setSessionState((state) => ({ ...state, id: 'abc123' }))

      expect(mockCookie.getStoredValues()[0]).toContain('id=abc123')
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
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState!.id).toBe('123')
    })

    it('should add c=xxx to cookie on write', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()

      await strategy.setSessionState(() => ({ id: 'abc' }))

      expect(mockCookie.getStoredValues()[0]).toContain('c=0')
    })

    it('should strip c from state passed to fn', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return { ...state, id: 'test' }
      })

      expect(capturedState!.c).toBeUndefined()
    })

    it('should strip c from state emitted via observable', () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = jasmine.createSpy<(event: SessionObservableEvent) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      // Simulate an external change that the cookie observable would report
      mockCookie.simulateExternalChange('id=test&c=0')

      expect(spy).toHaveBeenCalledOnceWith({ cookieValue: 'id=test&c=0', sessionState: { id: 'test' } })
    })

    it('should not write c to cookie when state is empty (deletes cookie)', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=0'])

      await strategy.setSessionState(() => ({}))

      expect(mockCookie.getStoredValues()).toEqual([])
    })

    it('should ignore observable updates from cookies with non-matching c marker', () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = jasmine.createSpy<(event: SessionObservableEvent) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      // Simulate an external write with a different c marker (e.g. partitioned cookie)
      mockCookie.simulateExternalChange('id=foreign&c=ff')

      expect(spy).not.toHaveBeenCalled()
    })

    it('should ignore observable updates from non-empty cookies with no c marker', () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = jasmine.createSpy<(event: SessionObservableEvent) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      // Simulate an external write from a cookie without a c marker
      mockCookie.simulateExternalChange('id=old-session')

      expect(spy).not.toHaveBeenCalled()
    })

    it('should notify observable when cookie is cleared', () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      const spy = jasmine.createSpy<(event: SessionObservableEvent) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      mockCookie.simulateExternalChange('')

      expect(spy).toHaveBeenCalledOnceWith({ cookieValue: '', sessionState: {} })
    })

    it('should notify sessionObservable after write', async () => {
      const { strategy } = setupCookieStrategy()
      const spy = jasmine.createSpy<(event: SessionObservableEvent) => void>('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      // Simulate an external change matching our c marker
      // mockCookie.simulateExternalChange('id=test-id&c=0')
      await strategy.setSessionState(() => ({ id: '123' }))

      expect(spy).toHaveBeenCalledOnceWith({ cookieValue: 'id=123&c=0', sessionState: { id: '123' } })
    })

    it('should queue setSessionState calls and process them sequentially', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
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
      })

      expect(capturedState.id).toBe('456')
    })

    it('should return state from first cookie if there is no match', async () => {
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=123&c=1', 'id=789&c=2'])

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
      const { strategy, mockCookie } = setupCookieStrategy({ trackAnonymousUser: true })

      await strategy.setSessionState(() => ({ id: '123', created: '0' }))

      expect(mockCookie.getLastExpireDelay()).toBe(SESSION_COOKIE_EXPIRATION_DELAY)
    })

    it('should use 4h expiration when trackAnonymousUser=false', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ trackAnonymousUser: false })

      await strategy.setSessionState(() => ({ id: '123', created: '0' }))

      expect(mockCookie.getLastExpireDelay()).toBe(SESSION_TIME_OUT_DELAY)
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

  describe('migration from legacy cookie', () => {
    function setLegacyCookie(value: string) {
      const mock = mockCookies()
      mock.getCookies().push({
        name: LEGACY_SESSION_STORE_KEY,
        value,
        expires: Date.now() + 60_000,
      })
    }

    it('should read from legacy cookie on first call when new cookie is empty', async () => {
      setLegacyCookie('id=legacy-id&created=123&c=0')
      const { strategy } = setupCookieStrategy()

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState!.id).toBe('legacy-id')
      expect(capturedState!.created).toBe('123')
    })

    it('should not read from legacy cookie when new cookie has data', async () => {
      setLegacyCookie('id=legacy-id&c=0')
      const { strategy, mockCookie } = setupCookieStrategy()
      mockCookie.setAllValues(['id=new-id&c=0'])

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState!.id).toBe('new-id')
    })

    it('should not read from legacy cookie on subsequent calls', async () => {
      setLegacyCookie('id=legacy-id&c=0')
      const { strategy, mockCookie } = setupCookieStrategy()

      // First call triggers migration
      await strategy.setSessionState((state) => state)

      // Clear the new cookie to simulate empty state
      mockCookie.setAllValues([])

      // Second call should not read from legacy cookie
      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      expect(capturedState).toEqual({})
    })
  })

  describe('c=xxx encoding', () => {
    it('should encode cookie options in the cookie value', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({ id: '123' }))

      expect(mockCookie.getStoredValues()[0]).toMatch(/^id=123&c=1/)
    })

    it('should not encode cookie options in the cookie value if the session is empty', async () => {
      const { strategy, mockCookie } = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      await strategy.setSessionState(() => ({}))

      expect(mockCookie.getStoredValues()).toEqual([])
    })
  })
})
