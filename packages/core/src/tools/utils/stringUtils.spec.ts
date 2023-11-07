import { safeTruncate, findCommaSeparatedValue, findCommaSeparatedValues } from './stringUtils'

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

    it('is white-spaces tolerant', () => {
      expect(findCommaSeparatedValue('   foo  =   a;  bar  =   b', 'foo')).toBe('a')
      expect(findCommaSeparatedValue('   foo  =   a;  bar  =   b', 'bar')).toBe('b')
    })

    it('supports values containing an = character', () => {
      expect(findCommaSeparatedValue('foo=a=b', 'foo')).toBe('a=b')
    })

    it('supports keys containing `-`', () => {
      expect(findCommaSeparatedValue('foo-bar=baz', 'foo-bar')).toBe('baz')
    })

    it('returns undefined if the value is not found', () => {
      expect(findCommaSeparatedValue('foo=a;bar=b', 'baz')).toBe(undefined)
    })
  })

  describe('findCommaSeparatedValues', () => {
    it('returns the values from a comma separated hash', () => {
      const expectedValues = new Map<string, string>()
      expectedValues.set('foo', 'a')
      expectedValues.set('bar', 'b')
      expect(findCommaSeparatedValues('foo=a;bar=b')).toEqual(expectedValues)
    })
  })
})
