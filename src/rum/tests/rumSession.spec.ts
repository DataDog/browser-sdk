import { COOKIE_ACCESS_DELAY, getCookie, SESSION_COOKIE_NAME, setCookie } from '../../core/session'
import { startRumSession } from '../rumSession'

describe('session', () => {
  const DURATION = 123456

  it('should store id in cookie', () => {
    startRumSession()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)
  })

  it('should keep existing id', () => {
    setCookie(SESSION_COOKIE_NAME, 'abcdef', DURATION)

    startRumSession()

    expect(getCookie(SESSION_COOKIE_NAME)).toEqual('abcdef')
  })

  it('should renew session on activity after expiration', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date())

    startRumSession()

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    jasmine.clock().tick(COOKIE_ACCESS_DELAY)

    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/^[a-f0-9-]+$/)

    jasmine.clock().uninstall()
  })
})
