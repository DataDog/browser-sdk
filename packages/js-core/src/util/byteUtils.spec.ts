import { computeBytesCount, concatBuffers } from './byteUtils'

describe('byteUtils', () => {
  describe('computeBytesCount', () => {
    it('should count the bytes of a message composed of 1 byte characters', () => {
      expect(computeBytesCount('1234')).toEqual(4)
    })

    it('should count the bytes of a message composed of multiple bytes characters', () => {
      expect(computeBytesCount('🪐')).toEqual(4)
    })
  })

  describe('concatBuffers', () => {
    it('concatenates buffers correctly', () => {
      expect(concatBuffers([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5]), new Uint8Array([6])])).toEqual(
        new Uint8Array([1, 2, 3, 4, 5, 6])
      )
    })

    it('concatenates an empty buffer and a non-empty buffer', () => {
      expect(concatBuffers([new Uint8Array([]), new Uint8Array([1, 2, 3])])).toEqual(new Uint8Array([1, 2, 3]))
    })

    it('returns an empty buffer when an empty array is passed', () => {
      expect(concatBuffers([])).toEqual(new Uint8Array([]))
    })
  })
})
