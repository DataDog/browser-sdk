import { expect } from 'chai'
import * as sinon from 'sinon'
import { clearAllCookies } from '../../tests/specHelper'
import { COOKIE_ACCESS_DELAY, COOKIE_NAME, getCookie, setCookie, startSessionTracking } from '../session'

describe('session', () => {
  const DURATION = 123456
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now())
  })

  afterEach(() => {
    clock.restore()
    clearAllCookies()
  })

  it('should store id in cookie', () => {
    startSessionTracking()

    expect(getCookie(COOKIE_NAME)).match(/^[a-f0-9-]+$/)
  })

  it('should keep existing id', () => {
    setCookie(COOKIE_NAME, 'abcdef', DURATION)

    startSessionTracking()

    expect(getCookie(COOKIE_NAME)).equal('abcdef')
  })

  it('should renew session on activity after expiration', () => {
    startSessionTracking()

    setCookie(COOKIE_NAME, '', DURATION)
    expect(getCookie(COOKIE_NAME)).undefined
    clock.tick(COOKIE_ACCESS_DELAY)

    document.dispatchEvent(new CustomEvent('click'))

    expect(getCookie(COOKIE_NAME)).match(/^[a-f0-9-]+$/)
  })
})
