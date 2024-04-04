import { safeTruncate, findCommaSeparatedValue, findCommaSeparatedValues, findDataUrlAndTruncate } from './stringUtils'

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

  fdescribe('findDataUrlAndTruncate', () => {
    it('returns truncated url when detects data url of json', () => {
      const expectedUrl = 'data:text/json'
      expect(
        findDataUrlAndTruncate(
          'data:text/json; charset=utf-8,%7B%22data%22%3A%7B%22type%22%3A%22notebooks%22%2C%22attributes%22%3A%7B%22metadata%22%3A%7B'
        )
      ).toEqual(expectedUrl)
    })

    it('returns truncated url when detects data url of html', () => {
      const expectedUrl = 'data:text/html'
      expect(findDataUrlAndTruncate('data:text/html,%3Ch1%3EHello%2C%20World%21%3C%2Fh1%3E')).toEqual(expectedUrl)
    })

    it('returns truncated url when detects data url of image', () => {
      const expectedUrl = 'data:image/svg+xml;base64'
      expect(findDataUrlAndTruncate('data:image/svg+xml;base64,+DQo8L3N2Zz4=')).toEqual(expectedUrl)
    })
    it('returns truncated url when detects plain data url', () => {
      const expectedUrl = 'data:'
      expect(findDataUrlAndTruncate('data:,Hello%2C%20World%21')).toEqual(expectedUrl)
    })

    it('returns null when no data url found', () => {
      const nonDataUrl = 'https://static.datad0g.com/static/c/70086/chunk.min.js'
      expect(findDataUrlAndTruncate(nonDataUrl)).toBeNull()
    })
  })
})
