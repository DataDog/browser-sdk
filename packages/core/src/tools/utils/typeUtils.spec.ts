import { getType } from './typeUtils'

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
})
