import { COOKIE_ACCESS_DELAY, getCookie, SESSION_COOKIE_NAME, setCookie, startSessionTracking } from '../session'

describe('session', () => {
  const DURATION = 123456

  it('should store id in cookie', () => {
    startSessionTracking()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('should keep existing id', () => {
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    startSessionTracking()

    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('should renew session on activity after expiration', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())

    startSessionTracking()

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)

    jasmine.clock().uninstall()
  })
})
