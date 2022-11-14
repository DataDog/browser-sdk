import { isIE } from './browserDetection'
import { readBytesFromStream } from './readBytesFromStream'

describe('readBytesFromStream', () => {
  const str = 'Lorem ipsum dolor sit amet.'
  let beenCalled = false
  let stream: ReadableStream

  beforeEach(() => {
    if (isIE()) {
      pending('no ReadableStream support')
    }
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
    readBytesFromStream(
      stream,
      (error, bytes, limitExceeded) => {
        expect(error).toBeUndefined()
        expect(bytes?.length).toBe(27)
        expect(limitExceeded).toBe(false)
        done()
      },
      {
        limit: Number.POSITIVE_INFINITY,
        collectStreamBody: true,
      }
    )
  })

  it('should read full stream without body', (done) => {
    readBytesFromStream(
      stream,
      (error, bytes, limitExceeded) => {
        expect(error).toBeUndefined()
        expect(bytes).toBeUndefined()
        expect(limitExceeded).toBeUndefined()
        done()
      },
      {
        limit: Number.POSITIVE_INFINITY,
        collectStreamBody: false,
      }
    )
  })

  it('should read stream up to limit', (done) => {
    readBytesFromStream(
      stream,
      (error, bytes, limitExceeded) => {
        expect(error).toBeUndefined()
        expect(bytes?.length).toBe(10)
        expect(limitExceeded).toBe(true)
        done()
      },
      {
        limit: 10,
        collectStreamBody: true,
      }
    )
  })

  it('should return error', (done) => {
    const stream = new ReadableStream({
      pull: () => Promise.reject(new Error('foo')),
    })

    readBytesFromStream(
      stream,
      (error, bytes, limitExceeded) => {
        expect(error).toBeDefined()
        expect(bytes).toBeUndefined()
        expect(limitExceeded).toBeUndefined()
        done()
      },
      {
        limit: Number.POSITIVE_INFINITY,
        collectStreamBody: true,
      }
    )
  })
})
