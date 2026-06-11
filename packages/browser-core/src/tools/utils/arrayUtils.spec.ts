import { mergeArrays } from './arrayUtils'

describe('arrayUtils', () => {
  describe('mergeArrays', () => {
    it('should return undefined when both arrays are undefined', () => {
      expect(mergeArrays(undefined, undefined)).toBeUndefined()
    })

    it('should return the current array when the next array is undefined or empty', () => {
      const current = ['a']

      expect(mergeArrays(current, undefined)).toBe(current)
      expect(mergeArrays(current, [])).toBe(current)
    })

    it('should return the next array when the current array is undefined', () => {
      const next = ['b']

      expect(mergeArrays(undefined, next)).toBe(next)
    })

    it('should concatenate current and next arrays when both have values', () => {
      expect(mergeArrays(['a'], ['b'])).toEqual(['a', 'b'])
    })
  })
})
