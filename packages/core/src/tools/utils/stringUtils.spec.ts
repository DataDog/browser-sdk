import {
  safeTruncate,
  findCommaSeparatedValue,
  findCommaSeparatedValues,
  findAllCommaSeparatedValues,
} from './stringUtils'

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

    it('supports names containing `-`', () => {
      expect(findCommaSeparatedValue('foo-bar=baz', 'foo-bar')).toBe('baz')
    })

    it('supports names containing special characters', () => {
      // See https://stackoverflow.com/a/1969339
      // See RFC2616 section 2.2: https://www.ietf.org/rfc/rfc2616.txt
      // See RFC6265 section 4.1.1: https://www.ietf.org/rfc/rfc6265.txt
      const allAllowedSpecialCharacters = "!#$%&'*+-.^_`|~"
      expect(findCommaSeparatedValue(`${allAllowedSpecialCharacters}=baz`, allAllowedSpecialCharacters)).toBe('baz')
    })

    it('returns undefined if the value is not found', () => {
      expect(findCommaSeparatedValue('foo=a;bar=b', 'baz')).toBe(undefined)
    })

    it('returns empty string if the value is empty', () => {
      expect(findCommaSeparatedValue('foo=', 'foo')).toBe('')
    })

    it('supports cookie string with leading empty value', () => {
      const cookieStringWithLeadingEmptyValue = 'first=;second=second'

      expect(findCommaSeparatedValue(cookieStringWithLeadingEmptyValue, 'first')).toBe('')
      expect(findCommaSeparatedValue(cookieStringWithLeadingEmptyValue, 'second')).toBe('second')
    })

    it('supports cookie string with trailing empty value', () => {
      const cookieStringWithTrailingEmptyValue = 'first=first;second='

      expect(findCommaSeparatedValue(cookieStringWithTrailingEmptyValue, 'first')).toBe('first')
      expect(findCommaSeparatedValue(cookieStringWithTrailingEmptyValue, 'second')).toBe('')
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

  describe('findAllCommaSeparatedValues', () => {
    it('returns all the values from a comma separated hash', () => {
      const expectedValues = new Map<string, string[]>()
      expectedValues.set('foo', ['a', 'c'])
      expectedValues.set('bar', ['b'])
      expect(findAllCommaSeparatedValues('foo=a;bar=b;foo=c')).toEqual(expectedValues)
    })
  })
})
