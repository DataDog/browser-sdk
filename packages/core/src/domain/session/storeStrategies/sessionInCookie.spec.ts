import { resetExperimentalFeatures } from '../../../tools/experimentalFeatures'
import { mockClock } from '../../../../test'
import { setCookie, deleteCookie, getCookie, getCurrentSite } from '../../../browser/cookie'
import { type SessionState } from '../sessionState'
import type { Configuration } from '../../configuration'
import { SESSION_TIME_OUT_DELAY } from '../sessionConstants'
import { buildCookieOptions, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'
import type { SessionStoreStrategy } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

export const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration
describe('session in cookie strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  let cookieStorageStrategy: SessionStoreStrategy

  beforeEach(() => {
    cookieStorageStrategy = initCookieStrategy(DEFAULT_INIT_CONFIGURATION, {})
  })

  afterEach(() => {
    deleteCookie(SESSION_STORE_KEY)
  })

  it('should persist a session in a cookie', () => {
    cookieStorageStrategy.persistSession(sessionState)
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(getCookie(SESSION_STORE_KEY)).toBe('id=123&created=0')
  })

  it('should set `isExpired=1` and `aid` to the cookie holding the session', () => {
    spyOn(Math, 'random').and.callFake(() => 0)
    cookieStorageStrategy.persistSession(sessionState)
    cookieStorageStrategy.expireSession(sessionState)
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1', anonymousId: '0' })
    expect(getCookie(SESSION_STORE_KEY)).toBe('isExpired=1&aid=0')
  })

  it('should return an empty object if session string is invalid', () => {
    setCookie(SESSION_STORE_KEY, '{test:42}', 1000)
    const session = cookieStorageStrategy.retrieveSession()
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
        cookieString: /^dd_cookie_test_[\w-]+=[^;]*;expires=[^;]+;path=\/;samesite=strict$/,
        description: 'should set samesite to strict by default',
      },
      {
        initConfiguration: { clientToken: 'abc', useSecureSessionCookie: true },
        cookieOptions: { secure: true },
        cookieString: /^dd_cookie_test_[\w-]+=[^;]*;expires=[^;]+;path=\/;samesite=strict;secure$/,
        description: 'should add secure attribute when defined',
      },
      {
        initConfiguration: { clientToken: 'abc', trackSessionAcrossSubdomains: true },
        cookieOptions: { domain: 'foo.bar' },
        cookieString: new RegExp(
          `^dd_cookie_test_[\\w-]+=[^;]*;expires=[^;]+;path=\\/;samesite=strict;domain=${getCurrentSite()}$`
        ),
        description: 'should set cookie domain when tracking accross subdomains',
      },
    ].forEach(({ description, initConfiguration, cookieString }) => {
      it(description, () => {
        const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
        selectCookieStrategy(initConfiguration)
        expect(cookieSetSpy.calls.argsFor(0)[0]).toMatch(cookieString)
      })
    })
  })
})
describe('session in cookie strategy when opt-out anonymous user tracking', () => {
  const anonymousId = 'device-123'
  const sessionState: SessionState = { id: '123', created: '0' }
  let cookieStorageStrategy: SessionStoreStrategy

  beforeEach(() => {
    cookieStorageStrategy = initCookieStrategy({ trackAnonymousUser: false } as Configuration, {})
  })

  afterEach(() => {
    resetExperimentalFeatures()
    deleteCookie(SESSION_STORE_KEY)
  })

  it('should not extend cookie expiration time when opt-out', () => {
    const cookieSetSpy = spyOnProperty(document, 'cookie', 'set')
    const clock = mockClock()
    cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    expect(cookieSetSpy.calls.argsFor(0)[0]).toContain(new Date(clock.timeStamp(SESSION_TIME_OUT_DELAY)).toUTCString())
    clock.cleanup()
  })

  it('should not persist or expire a session with anonymous id when opt-out', () => {
    cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    cookieStorageStrategy.expireSession({ ...sessionState, anonymousId })
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(getCookie(SESSION_STORE_KEY)).toBe('isExpired=1')
  })
})
