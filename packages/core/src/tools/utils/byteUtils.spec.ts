import { computeBytesCount } from './byteUtils'

describe('byteUtils', () => {
  describe('computeBytesCount', () => {
    it('should count the bytes of a message composed of 1 byte characters', () => {
      expect(computeBytesCount('1234')).toEqual(4)
    })

    it('should count the bytes of a message composed of multiple bytes characters', () => {
      expect(computeBytesCount('🪐')).toEqual(4)
    })
  })
})
