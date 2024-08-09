import { isSafari } from '@datadog/browser-core'
import { parseQuery, matchWithWildcard } from './eventFilters'

if (!isSafari()) {
  describe('parseQuery', () => {
    it('return a simple field', () => {
      expect(parseQuery('foo:bar')).toEqual([['foo', 'bar']])
    })
    it('return intermediary fields', () => {
      expect(parseQuery('foo.bar:baz')).toEqual([['foo.bar', 'baz']])
    })
    it('return multiple fields', () => {
      expect(parseQuery('foo:bar baz:qux')).toEqual([
        ['foo', 'bar'],
        ['baz', 'qux'],
      ])
    })
    it('parse escaped whitespace with backslashes in search terms', () => {
      expect(parseQuery('foo:bar\\ baz')).toEqual([['foo', 'bar\\ baz']])
    })
    it('parse escaped whitespace with backslashes in keys', () => {
      expect(parseQuery('foo\\ bar:baz')).toEqual([['foo\\ bar', 'baz']])
    })
    it('return multiple fields with escaped whitespace', () => {
      expect(parseQuery('foo\\ bar:baz\\ qux')).toEqual([['foo\\ bar', 'baz\\ qux']])
      expect(parseQuery('foo:bar\\ baz qux:quux\\ corge')).toEqual([
        ['foo', 'bar\\ baz'],
        ['qux', 'quux\\ corge'],
      ])
    })
  })

  describe('matchWithWildcard', () => {
    it('matches exact strings', () => {
      expect(matchWithWildcard('foo', 'foo')).toBe(true)
    })
    it('matches exact strings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'FOO')).toBe(true)
    })
    it('matches substrings', () => {
      expect(matchWithWildcard('foo', 'oo')).toBe(true)
    })
    it('matches substrings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'OO')).toBe(true)
    })
    it('does not match missing substrings', () => {
      expect(matchWithWildcard('foo', 'bar')).toBe(false)
    })
    it('does not match missing substrings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'BAR')).toBe(false)
    })
    it('matches with wildcard at the beginning', () => {
      expect(matchWithWildcard('foo', '*oo')).toBe(true)
    })
    it('matches with wildcard at the end', () => {
      expect(matchWithWildcard('foo', 'fo*')).toBe(true)
    })
    it('matches with wildcard at the beginning and the end', () => {
      expect(matchWithWildcard('foo', '*o*')).toBe(true)
    })
    it('matches with wildcard at the beginning and the end case-insensitively', () => {
      expect(matchWithWildcard('foo', '*O*')).toBe(true)
    })
    it('does not match missing substrings with wildcard at the beginning', () => {
      expect(matchWithWildcard('foo', '*bar')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the end', () => {
      expect(matchWithWildcard('foo', 'bar*')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the beginning and the end', () => {
      expect(matchWithWildcard('foo', '*bar*')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the beginning and the end case-insensitively', () => {
      expect(matchWithWildcard('foo', '*BAR*')).toBe(false)
    })
  })
}
