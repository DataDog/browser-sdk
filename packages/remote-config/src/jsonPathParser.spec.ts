import { parseJsonPath } from './jsonPathParser'

describe('jsonPathParser', () => {
  describe('parseJsonPath', () => {
    describe('valid paths', () => {
      it('should parse simple dot notation', () => {
        expect(parseJsonPath('foo')).toEqual(['foo'])
        expect(parseJsonPath('foo.bar')).toEqual(['foo', 'bar'])
        expect(parseJsonPath('foo.bar.baz')).toEqual(['foo', 'bar', 'baz'])
      })

      it('should parse bracket notation with string keys', () => {
        expect(parseJsonPath("['foo']")).toEqual(['foo'])
        expect(parseJsonPath('["foo"]')).toEqual(['foo'])
        expect(parseJsonPath("['foo']['bar']")).toEqual(['foo', 'bar'])
        expect(parseJsonPath('["foo"]["bar"]')).toEqual(['foo', 'bar'])
      })

      it('should parse bracket notation with numeric indices', () => {
        expect(parseJsonPath('[0]')).toEqual(['0'])
        expect(parseJsonPath('[42]')).toEqual(['42'])
        expect(parseJsonPath('[0][1][2]')).toEqual(['0', '1', '2'])
      })

      it('should parse mixed dot and bracket notation', () => {
        expect(parseJsonPath("foo['bar']")).toEqual(['foo', 'bar'])
        expect(parseJsonPath("foo.bar['baz']")).toEqual(['foo', 'bar', 'baz'])
        expect(parseJsonPath("['foo'].bar")).toEqual(['foo', 'bar'])
        expect(parseJsonPath("foo['bar'].baz[0]")).toEqual(['foo', 'bar', 'baz', '0'])
      })

      it('should parse paths starting with bracket notation', () => {
        expect(parseJsonPath("['foo']")).toEqual(['foo'])
        expect(parseJsonPath("['foo'].bar")).toEqual(['foo', 'bar'])
        expect(parseJsonPath('[0].foo')).toEqual(['0', 'foo'])
      })

      it('should handle identifiers with special characters', () => {
        expect(parseJsonPath('_foo')).toEqual(['_foo'])
        expect(parseJsonPath('$foo')).toEqual(['$foo'])
        expect(parseJsonPath('foo_bar')).toEqual(['foo_bar'])
        expect(parseJsonPath('foo$bar')).toEqual(['foo$bar'])
        expect(parseJsonPath('foo123')).toEqual(['foo123'])
      })

      it('should handle escaped characters in bracket notation', () => {
        expect(parseJsonPath("['foo\\'bar']")).toEqual(["foo'bar"])
        expect(parseJsonPath('["foo\\"bar"]')).toEqual(['foo"bar'])
        expect(parseJsonPath("['foo\\\\bar']")).toEqual(['foo\\bar'])
        expect(parseJsonPath("['foo\\nbar']")).toEqual(['foo\nbar'])
        expect(parseJsonPath("['foo\\tbar']")).toEqual(['foo\tbar'])
      })

      it('should handle Unicode escape sequences', () => {
        expect(parseJsonPath("['foo\\u0041bar']")).toEqual(['fooAbar'])
        expect(parseJsonPath("['\\u0042\\u0043']")).toEqual(['BC'])
      })

      it('should handle single and double quotes interchangeably', () => {
        expect(parseJsonPath("['foo']")).toEqual(['foo'])
        expect(parseJsonPath('["foo"]')).toEqual(['foo'])
        expect(parseJsonPath("['foo']['bar']")).toEqual(['foo', 'bar'])
        expect(parseJsonPath('["foo"]["bar"]')).toEqual(['foo', 'bar'])
        expect(parseJsonPath('[\'foo\']["bar"]')).toEqual(['foo', 'bar'])
      })

      it('should parse complex real-world-like paths', () => {
        expect(parseJsonPath('window.APP.version')).toEqual(['window', 'APP', 'version'])
        expect(parseJsonPath("window['APP'].settings['debug-mode']")).toEqual([
          'window',
          'APP',
          'settings',
          'debug-mode',
        ])
        expect(parseJsonPath('data.users[0].name')).toEqual(['data', 'users', '0', 'name'])
      })
    })

    describe('invalid paths', () => {
      it('should return empty array for unclosed bracket', () => {
        expect(parseJsonPath("['foo")).toEqual([])
        expect(parseJsonPath("foo['bar")).toEqual([])
      })

      it('should return empty array for unclosed quote', () => {
        expect(parseJsonPath("['foo")).toEqual([])
      })

      it('should return empty array for invalid syntax', () => {
        expect(parseJsonPath('foo.')).toEqual([])
        expect(parseJsonPath('foo..')).toEqual([])
        expect(parseJsonPath('.foo')).toEqual([])
      })

      it('should return empty array for invalid escape sequences', () => {
        expect(parseJsonPath("['foo\\xbar']")).toEqual([])
      })

      it('should return empty array for mismatched quotes', () => {
        expect(parseJsonPath('[\'foo"]')).toEqual([])
        expect(parseJsonPath('["foo\']')).toEqual([])
      })

      it('should return empty array for invalid bracket combinations', () => {
        expect(parseJsonPath('foo]]')).toEqual([])
        expect(parseJsonPath('foo[[')).toEqual([])
      })

      it('should return empty array for trailing dots', () => {
        expect(parseJsonPath('foo.bar.')).toEqual([])
      })

      it('should return empty array for invalid numeric indices', () => {
        expect(parseJsonPath('foo[bar]')).toEqual([])
      })
    })

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(parseJsonPath('')).toEqual([])
      })

      it('should handle very long paths', () => {
        const path = 'a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p'
        const result = parseJsonPath(path)
        expect(result.length).toBe(16)
        expect(result[0]).toBe('a')
        expect(result[15]).toBe('p')
      })

      it('should handle many array indices', () => {
        const path = '[0][1][2][3][4][5]'
        expect(parseJsonPath(path)).toEqual(['0', '1', '2', '3', '4', '5'])
      })

      it('should handle keys with numbers', () => {
        expect(parseJsonPath('foo123')).toEqual(['foo123'])
        expect(parseJsonPath('foo123.bar456')).toEqual(['foo123', 'bar456'])
      })

      it('should handle underscores and dollar signs', () => {
        expect(parseJsonPath('_foo$bar')).toEqual(['_foo$bar'])
        expect(parseJsonPath('$window')).toEqual(['$window'])
        expect(parseJsonPath('_private')).toEqual(['_private'])
      })
    })

    describe('special characters in keys', () => {
      it('should handle keys with hyphens', () => {
        expect(parseJsonPath("['foo-bar']")).toEqual(['foo-bar'])
        expect(parseJsonPath("['data-version']")).toEqual(['data-version'])
      })

      it('should handle keys with spaces', () => {
        expect(parseJsonPath("['foo bar']")).toEqual(['foo bar'])
        expect(parseJsonPath('["my key"]')).toEqual(['my key'])
      })

      it('should handle keys with special symbols', () => {
        expect(parseJsonPath("['foo@bar']")).toEqual(['foo@bar'])
        expect(parseJsonPath("['foo#bar']")).toEqual(['foo#bar'])
        expect(parseJsonPath("['foo.bar']")).toEqual(['foo.bar'])
      })

      it('should handle empty keys', () => {
        // Empty keys are invalid in the parser
        expect(parseJsonPath("['']")).toEqual([])
        expect(parseJsonPath('[""]')).toEqual([])
      })
    })
  })
})
