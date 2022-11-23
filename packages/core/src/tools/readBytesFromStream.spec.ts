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
        bytesLimit: Number.POSITIVE_INFINITY,
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
        bytesLimit: Number.POSITIVE_INFINITY,
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
        bytesLimit: 10,
        collectStreamBody: true,
      }
    )
  })

  it('should handle rejection error on pull', (done) => {
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
        bytesLimit: Number.POSITIVE_INFINITY,
        collectStreamBody: true,
      }
    )
  })

  it('should handle rejection error on cancel', (done) => {
    const stream = new ReadableStream({
      pull: (controller) => controller.enqueue(new TextEncoder().encode('f')),
      cancel: () => Promise.reject(new Error('foo')),
    })

    readBytesFromStream(
      stream,
      (error, bytes) => {
        expect(error).toBeUndefined()
        expect(bytes).toBeDefined()
        done()
      },
      {
        bytesLimit: 64,
        collectStreamBody: true,
      }
    )
  })

  it('reads a limited amount of bytes from the response', (done) => {
    // Creates a response that stream "f" indefinitely, one byte at a time
    const cancelSpy = jasmine.createSpy()
    const pullSpy = jasmine.createSpy().and.callFake((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new TextEncoder().encode('f'))
    })

    const bytesLimit = 64

    const stream = new ReadableStream({
      pull: pullSpy,
      cancel: cancelSpy,
    })

    readBytesFromStream(
      stream,
      () => {
        expect(pullSpy).toHaveBeenCalledTimes(
          // readBytesFromStream may read one more byte than necessary to make sure it exceeds the limit
          bytesLimit + 1
        )
        expect(cancelSpy).toHaveBeenCalledTimes(1)
        done()
      },
      {
        bytesLimit,
        collectStreamBody: true,
      }
    )
  })
})
