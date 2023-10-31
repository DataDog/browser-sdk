import { createIdentityEncoder } from './encoder'
import { noop } from './utils/functionUtils'

describe('createIdentityEncoder', () => {
  it('creates an encoder with initial values', () => {
    const encoder = createIdentityEncoder()

    expect(encoder.isEmpty).toBe(true)
    expect(encoder.finishSync()).toEqual({
      output: '',
      outputBytesCount: 0,
      rawBytesCount: 0,
      pendingData: '',
    })
  })

  describe('write()', () => {
    it('writes data to the encoder', () => {
      const encoder = createIdentityEncoder()
      const data = 'Hello, world!'

      encoder.write(data)

      expect(encoder.isEmpty).toBe(false)
    })

    it('calls the callback when writing data with a callback', () => {
      const encoder = createIdentityEncoder()
      const data = 'Callback test'
      const callbackSpy = jasmine.createSpy()

      encoder.write(data, callbackSpy)

      expect(callbackSpy).toHaveBeenCalledOnceWith(data.length)
    })
  })

  describe('finish()', () => {
    it('calls the callback with the result', () => {
      const encoder = createIdentityEncoder()
      const data = 'Final data'
      encoder.write(data)
      const callbackSpy = jasmine.createSpy()

      encoder.finish(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledWith({
        output: data,
        outputBytesCount: data.length,
        rawBytesCount: data.length,
        pendingData: '',
      })
    })

    it('after calling finish(), the encoder should be considered empty', () => {
      const encoder = createIdentityEncoder()
      encoder.write('Some data')

      encoder.finish(noop)

      expect(encoder.isEmpty).toBe(true)
      expect(encoder.finishSync()).toEqual({
        output: '',
        outputBytesCount: 0,
        rawBytesCount: 0,
        pendingData: '',
      })
    })
  })

  describe('finishSync()', () => {
    it('returns the encoder result', () => {
      const encoder = createIdentityEncoder()
      const data = 'Hello, world!'

      encoder.write(data)

      expect(encoder.finishSync()).toEqual({
        output: data,
        outputBytesCount: data.length,
        rawBytesCount: data.length,
        pendingData: '',
      })
    })

    it('after calling finish(), the encoder should be considered empty', () => {
      const encoder = createIdentityEncoder()
      encoder.write('Some data')

      encoder.finishSync()

      expect(encoder.isEmpty).toBe(true)
      expect(encoder.finishSync()).toEqual({
        output: '',
        outputBytesCount: 0,
        rawBytesCount: 0,
        pendingData: '',
      })
    })
  })

  describe('estimateEncodedBytesCount()', () => {
    it('estimates encoded bytes count accurately', () => {
      const encoder = createIdentityEncoder()
      const data = 'Estimation test'

      const estimatedBytes = encoder.estimateEncodedBytesCount(data)

      expect(estimatedBytes).toBe(data.length)
    })
  })
})
