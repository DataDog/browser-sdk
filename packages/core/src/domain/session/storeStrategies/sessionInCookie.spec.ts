import { mockClock, getSessionState, registerCleanupTask } from '../../../../test'
import { setCookie, deleteCookie, getCookie } from '../../../browser/cookie'
import type { SessionState } from '../sessionState'
import type { InitConfiguration } from '../../configuration'
import { validateAndBuildConfiguration } from '../../configuration'
import { SESSION_COOKIE_EXPIRATION_DELAY, SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from '../sessionConstants'
import { buildCookieOptions, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'abc', trackAnonymousUser: true }

// Force the document.cookie fallback path in tests, even in browsers that support CookieStore.
// This ensures tests that spy on document.cookie work consistently.
let originalCookieStoreDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalCookieStoreDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cookieStore')
  Object.defineProperty(globalThis, 'cookieStore', { value: undefined, configurable: true, writable: true })
})

afterEach(() => {
  if (originalCookieStoreDescriptor) {
    Object.defineProperty(globalThis, 'cookieStore', originalCookieStoreDescriptor)
  } else {
    delete (globalThis as any).cookieStore
  }
})

function setupCookieStrategy(partialInitConfiguration: Partial<InitConfiguration> = {}) {
  const initConfiguration = {
    ...DEFAULT_INIT_CONFIGURATION,
    ...partialInitConfiguration,
  } as InitConfiguration

  const configuration = validateAndBuildConfiguration(initConfiguration)!
  const cookieOptions = buildCookieOptions(initConfiguration)!

  registerCleanupTask(() => deleteCookie(SESSION_STORE_KEY, cookieOptions))

  return initCookieStrategy(configuration, cookieOptions)
}

describe('session in cookie strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }

  it('should persist a session in a cookie', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    await cookieStorageStrategy.persistSession(sessionState)
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(getCookie(SESSION_STORE_KEY)).toBe('id=123&created=0&c=0')
  })

  it('should set `isExpired=1` to the cookie holding the session', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    spyOn(Math, 'random').and.callFake(() => 0)
    await cookieStorageStrategy.persistSession(sessionState)
    await cookieStorageStrategy.expireSession(sessionState)
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(getSessionState(SESSION_STORE_KEY)).toEqual({ isExpired: '1' })
  })

  it('should not generate an anonymousId if not present', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    await cookieStorageStrategy.persistSession(sessionState)
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ id: '123', created: '0' })
    expect(getSessionState(SESSION_STORE_KEY)).toEqual({ id: '123', created: '0' })
  })

  it('should return an empty object if session string is invalid', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    setCookie(SESSION_STORE_KEY, '{test:42}', 1000)
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({})
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

  describe('cookie options', () => {
    ;[
      {
        initConfiguration: { clientToken: 'abc' },
        cookieOptions: {},
        cookieString: /^dd_[\w_-]+=[^;]*;expires=[^;]+;path=\/;samesite=strict$/,
        description: 'should set samesite to strict by default',
      },
      {
        initConfiguration: { clientToken: 'abc', useSecureSessionCookie: true },
        cookieOptions: { secure: true },
        cookieString: /^dd_[\w_-]+=[^;]*;expires=[^;]+;path=\/;samesite=strict;secure$/,
        description: 'should add secure attribute when defined',
      },
      {
        initConfiguration: { clientToken: 'abc', trackSessionAcrossSubdomains: true },
        cookieOptions: { domain: 'foo.bar' },
        cookieString: new RegExp('^dd_[\\w_-]+=[^;]*;expires=[^;]+;path=\\/;samesite=strict;domain='),
        description: 'should set cookie domain when tracking accross subdomains',
      },
    ].forEach(({ description, initConfiguration, cookieString }) => {
      it(description, () => {
        const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
        selectCookieStrategy(initConfiguration)
        expect(cookieSetSpy).toHaveBeenCalled()
        for (const call of cookieSetSpy.calls.all()) {
          expect(call.args[0]).toMatch(cookieString)
        }
      })
    })
  })

  describe('encode cookie options', () => {
    it('should encode cookie options in the cookie value', async () => {
      // Some older browsers don't support partitioned cross-site session cookies
      // so instead of testing the cookie value, we test the call to the cookie setter
      const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
      const cookieStorageStrategy = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })
      await cookieStorageStrategy.persistSession({ id: '123' })

      const calls = cookieSetSpy.calls.all()
      const lastCall = calls[calls.length - 1]
      expect(lastCall.args[0]).toMatch(/^_dd_s=id=123&c=1/)
    })

    it('should not encode cookie options in the cookie value if the session is empty (deleting the cookie)', async () => {
      const cookieStorageStrategy = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })
      await cookieStorageStrategy.persistSession({})

      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('should return the correct session state from the cookies', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('_dd_s=id=123&c=0;_dd_s=id=456&c=1;_dd_s=id=789&c=2')
      const cookieStorageStrategy = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      expect(await cookieStorageStrategy.retrieveSession()).toEqual({ id: '456' })
    })

    it('should return the session state from the first cookie if there is no match', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('_dd_s=id=123&c=0;_dd_s=id=789&c=2')
      const cookieStorageStrategy = setupCookieStrategy({ usePartitionedCrossSiteSessionCookie: true })

      expect(await cookieStorageStrategy.retrieveSession()).toEqual({ id: '123' })
    })
  })
})

describe('session in cookie strategy when opt-in anonymous user tracking', () => {
  const anonymousId = 'device-123'
  const sessionState: SessionState = { id: '123', created: '0' }

  it('should persist with anonymous id', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    await cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState, anonymousId })
    expect(getCookie(SESSION_STORE_KEY)).toBe('id=123&created=0&aid=device-123&c=0')
  })

  it('should expire with anonymous id', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    await cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1', anonymousId })
    expect(getCookie(SESSION_STORE_KEY)).toBe('isExpired=1&aid=device-123&c=0')
  })

  it('should persist for one year when opt-in', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    const clock = mockClock()
    await cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(
      new Date(clock.timeStamp(SESSION_COOKIE_EXPIRATION_DELAY)).toUTCString()
    )
  })

  it('should expire in one year when opt-in', async () => {
    const cookieStorageStrategy = setupCookieStrategy()
    const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    const clock = mockClock()
    await cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(
      new Date(clock.timeStamp(SESSION_COOKIE_EXPIRATION_DELAY)).toUTCString()
    )
  })
})

describe('session in cookie strategy when opt-out anonymous user tracking', () => {
  const anonymousId = 'device-123'
  const sessionState: SessionState = { id: '123', created: '0' }

  it('should not extend cookie expiration time when opt-out', async () => {
    const cookieStorageStrategy = setupCookieStrategy({ trackAnonymousUser: false })
    const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    const clock = mockClock()
    await cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(new Date(clock.timeStamp(SESSION_TIME_OUT_DELAY)).toUTCString())
  })

  it('should not persist with one year when opt-out', async () => {
    const cookieStorageStrategy = setupCookieStrategy({ trackAnonymousUser: false })
    const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    await cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(new Date(Date.now() + SESSION_EXPIRATION_DELAY).toUTCString())
  })

  it('should not persist or expire a session with anonymous id when opt-out', async () => {
    const cookieStorageStrategy = setupCookieStrategy({ trackAnonymousUser: false })
    await cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    await cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    const session = await cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(getCookie(SESSION_STORE_KEY)).toBe('isExpired=1&c=0')
  })
})
