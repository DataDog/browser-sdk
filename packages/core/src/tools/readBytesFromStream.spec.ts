import { readBytesFromStream } from './readBytesFromStream'

describe('readBytesFromStream', () => {
  const str = 'Lorem ipsum dolor sit amet.'
  let beenCalled = false
  let stream: ReadableStream

  beforeEach(() => {
    beenCalled = false
    stream = new ReadableStream({
      pull: (controller) => {
        if (!beenCalled) {
          controller.enqueue(new TextEncoder().encode(str))
          beenCalled = true
        } else {
          controller.close()
        }
      },
    })
  })

  it('should read full stream', (done) => {
    readBytesFromStream(stream, Number.POSITIVE_INFINITY, true, (error, bytes, limitExceeded) => {
      expect(error).toBeUndefined()
      expect(bytes?.length).toBe(27)
      expect(limitExceeded).toBe(false)
      done()
    })
  })

  it('should read full stream without body', (done) => {
    readBytesFromStream(stream, Number.POSITIVE_INFINITY, false, (error, bytes, limitExceeded) => {
      expect(error).toBeUndefined()
      expect(bytes).toBeUndefined()
      expect(limitExceeded).toBeUndefined()
      done()
    })
  })

  it('should read stream up to limit', (done) => {
    readBytesFromStream(stream, 10, true, (error, bytes, limitExceeded) => {
      expect(error).toBeUndefined()
      expect(bytes?.length).toBe(10)
      expect(limitExceeded).toBe(true)
      done()
    })
  })

  it('should return error', (done) => {
    const stream = new ReadableStream({
      pull: () => Promise.reject(new Error('foo')),
    })

    readBytesFromStream(stream, Number.POSITIVE_INFINITY, true, (error, bytes, limitExceeded) => {
      expect(error).toBeDefined()
      expect(bytes).toBeUndefined()
      expect(limitExceeded).toBeUndefined()
      done()
    })
  })
})
