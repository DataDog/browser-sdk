import { ExperimentalFeature, resetExperimentalFeatures } from '../../../tools/experimentalFeatures'
import { mockCookie, mockExperimentalFeatures } from '../../../../test'
import { setCookie, deleteCookie, getCookie, getCurrentSite } from '../../../browser/cookie'
import { type SessionState } from '../sessionState'
import { buildCookieOptions, selectCookieStrategy, initCookieStrategy } from './sessionInCookie'
import type { SessionStoreStrategy } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

describe('session in cookie strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }
  let cookieStorageStrategy: SessionStoreStrategy

  beforeEach(() => {
    cookieStorageStrategy = initCookieStrategy({})
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

  it('should set `isExpired=1` to the cookie holding the session', () => {
    cookieStorageStrategy.persistSession(sessionState)
    cookieStorageStrategy.expireSession()
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(getCookie(SESSION_STORE_KEY)).toBe('isExpired=1')
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

    it('should be secure and crossSite when `useCrossSiteSessionCookie` is truthy', () => {
      const cookieOptions = buildCookieOptions({ clientToken, useCrossSiteSessionCookie: true })
      expect(cookieOptions).toEqual({ secure: true, crossSite: true, partitioned: false })
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
        initConfiguration: { clientToken: 'abc', useCrossSiteSessionCookie: true },
        cookieOptions: { crossSite: true, secure: true },
        cookieString: /^dd_cookie_test_[\w-]+=[^;]*;expires=[^;]+;path=\/;samesite=none;secure$/,
        description: 'should set samesite to none and secure to true for crossSite',
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
describe('session in cookie strategy with anonymous user tracking', () => {
  const anonymousId = 'device-123'
  const sessionState: SessionState = { id: '123', created: '0' }
  let cookieStorageStrategy: SessionStoreStrategy
  const GEN_UUID = '2gosa7pa2gw'

  beforeEach(() => {
    mockExperimentalFeatures([ExperimentalFeature.ANONYMOUS_USER_TRACKING])
    cookieStorageStrategy = initCookieStrategy({})
    spyOn(Math, 'random').and.returnValue(1)
  })

  afterEach(() => {
    resetExperimentalFeatures()
    deleteCookie(SESSION_STORE_KEY)
  })

  it('should persist a session with anonymous id in a cookie', () => {
    cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState, anonymousId })
    expect(getCookie(SESSION_STORE_KEY)).toBe(`id=123&created=0&aid=${anonymousId}`)
  })

  it('should persist a session with anonymous id in a cookie when it is not present', () => {
    setCookie(SESSION_STORE_KEY, 'id=123&created=0')
    cookieStorageStrategy.persistSession(sessionState)
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState, anonymousId: GEN_UUID } as SessionState)
    expect(getCookie(SESSION_STORE_KEY)).toBe(`id=123&created=0&aid=${GEN_UUID}`)
  })

  it('should expire a session with anonymous id in a cookie', () => {
    mockCookie(`id=123&created=0&aid=${anonymousId}`)

    cookieStorageStrategy.persistSession({ ...sessionState, anonymousId })
    cookieStorageStrategy.expireSession()
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1', anonymousId })
    expect(getCookie(SESSION_STORE_KEY)).toBe(`isExpired=1&aid=${anonymousId}`)
  })

  it('should return a new anonymous id if session cookie is not valid', () => {
    setCookie(SESSION_STORE_KEY, '{test:42}')
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ anonymousId: '2gosa7pa2gw' })
    expect(getCookie(SESSION_STORE_KEY)).toBe(`aid=${GEN_UUID}`)
  })

  it('should set a new anonymous id if session cookie does not contain anonymous id', () => {
    setCookie(SESSION_STORE_KEY, 'id=123&created=0')
    const session = cookieStorageStrategy.retrieveSession()
    expect(session).toEqual({ id: '123', created: '0', anonymousId: '2gosa7pa2gw' })
    expect(getCookie(SESSION_STORE_KEY)).toBe(`id=123&created=0&aid=${GEN_UUID}`)
  })
})
