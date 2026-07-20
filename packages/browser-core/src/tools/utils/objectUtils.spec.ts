import { describe, expect, it } from 'vitest'
import { getConstructorName, tryJsonParse } from './objectUtils'

describe('objectUtils', () => {
  describe('getConstructorName', () => {
    it('should return the constructor name of an object', () => {
      class Custom {}

      expect(getConstructorName({})).toBe('Object')
      expect(getConstructorName([])).toBe('Array')
      expect(getConstructorName(new Custom())).toBe('Custom')
      expect(getConstructorName(new Error())).toBe('Error')
    })

    it('should return the constructor name of a primitive value', () => {
      expect(getConstructorName('foo')).toBe('String')
      expect(getConstructorName(1)).toBe('Number')
      expect(getConstructorName(true)).toBe('Boolean')
    })

    it('should return undefined when there is no usable constructor name', () => {
      expect(getConstructorName(Object.create(null))).toBeUndefined()
      expect(getConstructorName(null)).toBeUndefined()
      expect(getConstructorName(undefined)).toBeUndefined()
    })

    it('should return undefined when constructor access throws', () => {
      const value = {}
      Object.defineProperty(value, 'constructor', {
        get() {
          throw new Error('Cannot access constructor')
        },
      })

      expect(getConstructorName(value)).toBeUndefined()
    })

    it('should return undefined when the constructor name is not a non-empty string', () => {
      expect(getConstructorName({ constructor: { name: '' } })).toBeUndefined()
      expect(getConstructorName({ constructor: { name: 42 } })).toBeUndefined()
    })
  })

  describe('tryJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(tryJsonParse('{"a":1}')).toEqual({ a: 1 })
    })

    it('should return undefined for invalid JSON', () => {
      expect(tryJsonParse('not json')).toBeUndefined()
    })

    it('should strip __proto__ key', () => {
      const result = tryJsonParse('{"a":1,"__proto__":{"injected":true}}')
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false)
      expect(({} as any).injected).toBeUndefined()
    })

    it('should strip nested __proto__ key', () => {
      tryJsonParse('{"a":{"__proto__":{"injected":true}}}')
      expect(({} as any).injected).toBeUndefined()
    })
  })
})
