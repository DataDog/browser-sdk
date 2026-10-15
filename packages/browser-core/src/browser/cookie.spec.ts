import { mockBaseConfiguration, mockCookies } from '../../test'
import { buildCookieOptions, getCurrentSite } from './cookie'

describe('cookie', () => {
  describe('getCurrentSite', () => {
    it('returns the eTLD+1 for example.com', () => {
      mockCookies()
      expect(getCurrentSite('example.com')).toBe('example.com')
    })

    it('returns the eTLD+1 for example.co.uk', () => {
      mockCookies({
        filter: (cookie) => cookie.domain !== '.co.uk',
      })
      expect(getCurrentSite('example.co.uk')).toBe('example.co.uk')
    })

    it('returns the eTLD+1 for foo.bar.baz.example.com', () => {
      mockCookies()
      expect(getCurrentSite('foo.bar.baz.example.com')).toBe('example.com')
    })

    it('does not left any cookies', () => {
      const { getCookies } = mockCookies()
      expect(getCurrentSite('example.com')).toBe('example.com')
      expect(getCookies()).toEqual([])
    })

    it('falls back to the referrer when the hostname is empty', () => {
      mockCookies()
      expect(getCurrentSite('', 'https://example.com')).toBe('example.com')
    })

    it('returns undefined when the referrer is empty', () => {
      mockCookies()
      expect(getCurrentSite('', '')).toBeUndefined()
    })

    it('caches the result', () => {
      const { setter } = mockCookies()

      expect(getCurrentSite('example.com')).toBe('example.com')
      expect(setter).toHaveBeenCalledTimes(2)

      expect(getCurrentSite('example.com')).toBe('example.com')
      expect(setter).toHaveBeenCalledTimes(2)
    })
  })
})

describe('buildCookieOptions', () => {
  it('should not be secure nor crossSite by default', () => {
    expect(buildCookieOptions(mockBaseConfiguration())).toEqual({ secure: false, crossSite: false, partitioned: false })
  })

  it('should be secure when `useSecureSessionCookie` is truthy', () => {
    expect(buildCookieOptions(mockBaseConfiguration({ useSecureSessionCookie: true }))).toEqual({
      secure: true,
      crossSite: false,
      partitioned: false,
    })
  })

  it('should be secure, crossSite and partitioned when `usePartitionedCrossSiteSessionCookie` is truthy', () => {
    expect(buildCookieOptions(mockBaseConfiguration({ usePartitionedCrossSiteSessionCookie: true }))).toEqual({
      secure: true,
      crossSite: true,
      partitioned: true,
    })
  })

  it('should have domain when `trackSessionAcrossSubdomains` is truthy', () => {
    expect(buildCookieOptions(mockBaseConfiguration({ trackSessionAcrossSubdomains: true }))).toEqual({
      secure: false,
      crossSite: false,
      partitioned: false,
      domain: jasmine.any(String),
    })
  })
})
