import { areCookiesAuthorized, deleteCookie, getCookie, setCookie } from './cookie'

const TEST_COOKIE = '_dd_test_cookie'

describe('getCookie', () => {
  afterEach(() => {
    deleteCookie(TEST_COOKIE)
  })

  it('returns undefined for a non-existent cookie', () => {
    expect(getCookie('__dd_nonexistent__')).toBeUndefined()
  })

  it('returns the value for an existing cookie', () => {
    setCookie(TEST_COOKIE, 'hello', 60_000)

    expect(getCookie(TEST_COOKIE)).toBe('hello')
  })
})

describe('setCookie', () => {
  afterEach(() => {
    deleteCookie(TEST_COOKIE)
  })

  it('writes a cookie that getCookie() can read', () => {
    setCookie(TEST_COOKIE, 'world', 60_000)

    expect(getCookie(TEST_COOKIE)).toBe('world')
  })

  it('sets the samesite attribute via options', () => {
    const setter = spyOnProperty(document, 'cookie', 'set')

    setCookie(TEST_COOKIE, 'v', 60_000, { sameSite: 'lax' })

    expect(setter).toHaveBeenCalledWith(jasmine.stringContaining('samesite=lax'))
  })

  it('sets the domain attribute via options', () => {
    const setter = spyOnProperty(document, 'cookie', 'set')

    setCookie(TEST_COOKIE, 'v', 60_000, { domain: 'example.com' })

    expect(setter).toHaveBeenCalledWith(jasmine.stringContaining(';domain=example.com'))
  })

  it('sets the secure attribute via options', () => {
    const setter = spyOnProperty(document, 'cookie', 'set')

    setCookie(TEST_COOKIE, 'v', 60_000, { secure: true })

    expect(setter).toHaveBeenCalledWith(jasmine.stringContaining(';secure'))
  })

  it('sets the partitioned attribute via options', () => {
    const setter = spyOnProperty(document, 'cookie', 'set')

    setCookie(TEST_COOKIE, 'v', 60_000, { partitioned: true })

    expect(setter).toHaveBeenCalledWith(jasmine.stringContaining(';partitioned'))
  })
})

describe('deleteCookie', () => {
  it('removes a cookie so getCookie() returns undefined', () => {
    setCookie(TEST_COOKIE, 'to-delete', 60_000)
    expect(getCookie(TEST_COOKIE)).toBe('to-delete')

    deleteCookie(TEST_COOKIE)

    expect(getCookie(TEST_COOKIE)).toBeUndefined()
  })
})

describe('areCookiesAuthorized', () => {
  it('returns true in the test environment', () => {
    expect(areCookiesAuthorized()).toBeTrue()
  })
})
