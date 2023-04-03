import { safeTruncate, findCommaSeparatedValue } from './stringUtils'

describe('stringUtils', () => {
  describe('safeTruncate', () => {
    it('should truncate a string', () => {
      const truncated = safeTruncate('1234😎7890', 6)
      expect(truncated.length).toBe(6)
      expect(truncated).toBe('1234😎')
    })

    it('should not break a surrogate characters pair', () => {
      const truncated = safeTruncate('12345😎890', 6)
      expect(truncated.length).toBe(7)
      expect(truncated).toBe('12345😎')
    })

    it('should add the suffix when the string is truncated', () => {
      const truncated = safeTruncate('12345😎890', 6, '...')
      expect(truncated).toBe('12345😎...')
    })

    it('should not add the suffix when the string is not truncated', () => {
      const truncated = safeTruncate('1234😎', 5, '...')
      expect(truncated).toBe('1234😎')
    })
  })

  describe('findCommaSeparatedValue', () => {
    it('returns the value from a comma separated hash', () => {
      expect(findCommaSeparatedValue('foo=a;bar=b', 'foo')).toBe('a')
      expect(findCommaSeparatedValue('foo=a;bar=b', 'bar')).toBe('b')
    })

    it('returns undefined if the value is not found', () => {
      expect(findCommaSeparatedValue('foo=a;bar=b', 'baz')).toBe(undefined)
    })
  })
})
