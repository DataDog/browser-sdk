import { mockCookies } from '../../test'
import { getCurrentSite, resetGetCurrentSite } from './cookie'

describe('cookie', () => {
  describe('getCurrentSite', () => {
    beforeEach(() => {
      resetGetCurrentSite()
    })

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
