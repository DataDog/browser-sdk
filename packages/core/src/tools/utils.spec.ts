import { display } from './display'
import { findCommaSeparatedValue, getType, matchList, safeTruncate } from './utils'

describe('utils', () => {
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

describe('getType', () => {
  it('should return "null" for null value', () => {
    expect(getType(null)).toEqual('null')
    expect(getType(undefined)).not.toEqual('null')
  })

  it('should return "array" for array value', () => {
    expect(getType([])).toEqual('array')
    expect(getType([1, 2, 3])).toEqual('array')
    expect(getType([1, 2, [3, 4, 5]])).toEqual('array')
  })

  it('should return result of typeof operator for other types', () => {
    expect(getType({})).toEqual('object')
    expect(getType(() => null)).toEqual('function')
    expect(getType('test')).toEqual('string')
    expect(getType(1)).toEqual('number')
    expect(getType(false)).toEqual('boolean')
    expect(getType(new Date())).toEqual('object')
  })
})

describe('matchList', () => {
  it('should match exact value', () => {
    const list = ['foo', 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should match regexp', () => {
    const list = [/^foo/, /foo$/]
    expect(matchList(list, 'foobar')).toBe(true)
    expect(matchList(list, 'barfoo')).toBe(true)
    expect(matchList(list, 'barqux')).toBe(false)
  })

  it('should match function', () => {
    const list = [(value: string) => value === 'foo', (value: string) => value === 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should compare strings using startsWith when enabling the option', () => {
    const list = ['http://my.domain.com']
    expect(matchList(list, 'http://my.domain.com/action', true)).toBe(true)
  })

  it('should catch error from provided function', () => {
    spyOn(display, 'error')
    const list = [
      (_: string) => {
        throw new Error('oops')
      },
    ]
    expect(matchList(list, 'foo')).toBe(false)
    expect(display.error).toHaveBeenCalled()
  })
})
