import { COOKIE_ACCESS_DELAY, COOKIE_NAME, getCookie, setCookie, startSessionTracking } from '../session'

describe('session', () => {
  const DURATION = 123456

  it('should store id in cookie', () => {
    startSessionTracking()

    expect(getCookie(COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('should keep existing id', () => {
    setCookie(COOKIE_NAME, 'abcdef', DURATION)

    startSessionTracking()

    expect(getCookie(COOKIE_NAME)).toEqual('abcdef')
  })

  it('should renew session on activity after expiration', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())

    startSessionTracking()

    setCookie(COOKIE_NAME, '', DURATION)
    expect(getCookie(COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)

    jasmine.clock().uninstall()
  })
})
