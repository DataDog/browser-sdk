import { getType, isIndexableObject } from './typeUtils'

describe('typeUtils', () => {
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

  describe('isIndexableObject', () => {
    it('returns true for plain objects', () => {
      expect(isIndexableObject({})).toBeTrue()
    })

    it('returns false for primitives', () => {
      expect(isIndexableObject(null)).toBeFalse()
      expect(isIndexableObject(undefined)).toBeFalse()
      expect(isIndexableObject('')).toBeFalse()
      expect(isIndexableObject(0)).toBeFalse()
      expect(isIndexableObject(false)).toBeFalse()
    })

    it("returned value don't matter too much for non-plain objects", () => {
      // This test assertions are not strictly relevent. The goal of this function is to be able to
      // use the value as a plain object. Using an array or a date as a plain object is fine, but
      // it doesn't make much sense, so we don't really care.
      expect(isIndexableObject([])).toBeFalse()
      expect(isIndexableObject(new Date())).toBeTrue()
    })
  })
})
