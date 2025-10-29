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

  it('should read full stream', async () => {
    const { bytes, limitExceeded } = await readBytesFromStream(stream, {
      bytesLimit: Number.POSITIVE_INFINITY,
      collectStreamBody: true,
    })

    expect(bytes?.length).toBe(27)
    expect(limitExceeded).toBe(false)
  })

  it('should read full stream without body', async () => {
    const { bytes, limitExceeded } = await readBytesFromStream(stream, {
      bytesLimit: Number.POSITIVE_INFINITY,
      collectStreamBody: false,
    })
    expect(bytes).toBeUndefined()
    expect(limitExceeded).toBeUndefined()
  })

  it('should read stream up to limit', async () => {
    const { bytes, limitExceeded } = await readBytesFromStream(stream, {
      bytesLimit: 10,
      collectStreamBody: true,
    })
    expect(bytes?.length).toBe(10)
    expect(limitExceeded).toBe(true)
  })

  it('should handle rejection error on pull', async () => {
    const stream = new ReadableStream({
      pull: () => Promise.reject(new Error('foo')),
    })

    try {
      await readBytesFromStream(stream, {
        bytesLimit: Number.POSITIVE_INFINITY,
        collectStreamBody: true,
      })
      fail('Should have thrown an error')
    } catch (error) {
      expect(error).toEqual(jasmine.any(Error))
    }
  })

  it('should handle rejection error on cancel', async () => {
    const stream = new ReadableStream({
      pull: (controller) => controller.enqueue(new TextEncoder().encode('f')),
      cancel: () => Promise.reject(new Error('foo')),
    })

    const { bytes } = await readBytesFromStream(stream, {
      bytesLimit: 64,
      collectStreamBody: true,
    })
    expect(bytes).toBeDefined()
  })

  it('reads a limited amount of bytes from the response', async () => {
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

    await readBytesFromStream(stream, {
      bytesLimit,
      collectStreamBody: true,
    })

    expect(pullSpy).toHaveBeenCalledTimes(
      // readBytesFromStream may read one more byte than necessary to make sure it exceeds the limit
      bytesLimit + 1
    )
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })
})
