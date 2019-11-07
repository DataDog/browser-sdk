import {
  cacheCookieAccess,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  startSessionManagement,
  stopSessionManagement,
} from '../src/sessionManagement'
import { isIE } from '../src/specHelper'

describe('cacheCookieAccess', () => {
  const TEST_COOKIE = 'test'
  const TEST_DELAY = 1000
  const DURATION = 123456
  let cookieCache: CookieCache

  beforeEach(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
    cookieCache = cacheCookieAccess(TEST_COOKIE)
  })

  afterEach(() => jasmine.clock().uninstall())

  it('should keep cookie value in cache', () => {
    setCookie(TEST_COOKIE, 'foo', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    setCookie(TEST_COOKIE, '', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    jasmine.clock().tick(TEST_DELAY)
    expect(cookieCache.get()).toBeUndefined()
  })

  it('should invalidate cache when updating the cookie', () => {
    setCookie(TEST_COOKIE, 'foo', DURATION)
    expect(cookieCache.get()).toEqual('foo')

    cookieCache.set('bar', DURATION)
    expect(cookieCache.get()).toEqual('bar')
  })
})

enum FakeSessionType {
  NOT_TRACKED = 'n',
  TRACKED = 't',
}
describe('startSessionManagement', () => {
  const DURATION = 123456
  const FIRST_SESSION_TYPE_COOKIE = 'foo'
  const SECOND_SESSION_TYPE_COOKIE = 'bar'

  function computeSessionState(rawType?: string, defaultType = FakeSessionType.TRACKED) {
    const type = rawType === FakeSessionType.NOT_TRACKED || rawType === FakeSessionType.TRACKED ? rawType : defaultType
    return {
      type,
      isTracked: type === FakeSessionType.TRACKED,
    }
  }

  function expireSession() {
    setCookie(FIRST_SESSION_TYPE_COOKIE, '', DURATION)
    setCookie(SECOND_SESSION_TYPE_COOKIE, '', DURATION)
    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())
  })

  afterEach(() => {
    // flush pending callbacks to avoid random failures
    jasmine.clock().tick(new Date().getTime())
    jasmine.clock().uninstall()
    stopSessionManagement()
  })

  it('when tracked, should store session type and id', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, (rawType) =>
      computeSessionState(rawType, FakeSessionType.TRACKED)
    )

    expect(session.getType()).toEqual(FakeSessionType.TRACKED)
    expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('when not tracked should store session type', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, (rawType) =>
      computeSessionState(rawType, FakeSessionType.NOT_TRACKED)
    )

    expect(session.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    expect(session.getId()).toBeUndefined()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('when tracked should keep existing session type and id', () => {
    setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.TRACKED, DURATION)
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, computeSessionState)

    expect(session.getType()).toEqual(FakeSessionType.TRACKED)
    expect(session.getId()).toMatch('abcdef')
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('when not tracked should keep existing session type', () => {
    setCookie(FIRST_SESSION_TYPE_COOKIE, FakeSessionType.NOT_TRACKED, DURATION)

    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, computeSessionState)

    expect(session.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    expect(session.getId()).toBeUndefined()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.NOT_TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('should renew on activity after expiration', () => {
    const session = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, computeSessionState)
    const renewSessionSpy = jasmine.createSpy()
    session.renewObservable.subscribe(renewSessionSpy)

    expireSession()

    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toBeUndefined()
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    expect(renewSessionSpy).not.toHaveBeenCalled()
    expect(session.getType()).toBeUndefined()
    expect(session.getId()).toBeUndefined()

    document.dispatchEvent(new CustomEvent('click'))

    expect(renewSessionSpy).toHaveBeenCalled()
    expect(getCookie(FIRST_SESSION_TYPE_COOKIE)).toEqual(FakeSessionType.TRACKED)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  describe('multiple startSessionManagement calls', () => {
    it('should re-use the same session id', () => {
      const sessionA = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, computeSessionState)
      const idA = sessionA.getId()

      const sessionB = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, computeSessionState)
      const idB = sessionB.getId()

      expect(idA).toBe(idB)
    })

    it('should have independent types', () => {
      const sessionA = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, (rawType) =>
        computeSessionState(rawType, FakeSessionType.TRACKED)
      )
      const sessionB = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, (rawType) =>
        computeSessionState(rawType, FakeSessionType.NOT_TRACKED)
      )

      expect(sessionA.getType()).toEqual(FakeSessionType.TRACKED)
      expect(sessionB.getType()).toEqual(FakeSessionType.NOT_TRACKED)
    })

    it('should notify each renew observables', () => {
      const sessionA = startSessionManagement(FIRST_SESSION_TYPE_COOKIE, computeSessionState)
      const renewSessionASpy = jasmine.createSpy()
      sessionA.renewObservable.subscribe(renewSessionASpy)

      const sessionB = startSessionManagement(SECOND_SESSION_TYPE_COOKIE, computeSessionState)
      const renewSessionBSpy = jasmine.createSpy()
      sessionB.renewObservable.subscribe(renewSessionBSpy)

      expireSession()

      expect(renewSessionASpy).not.toHaveBeenCalled()
      expect(renewSessionBSpy).not.toHaveBeenCalled()

      document.dispatchEvent(new CustomEvent('click'))

      expect(renewSessionASpy).toHaveBeenCalled()
      expect(renewSessionBSpy).toHaveBeenCalled()
    })
  })
})
