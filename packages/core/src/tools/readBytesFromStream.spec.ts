import { readBytesFromStream } from './readBytesFromStream'

describe('readBytesFromStream', () => {
  const str = 'Lorem ipsum dolor sit amet.'
  let stream: ReadableStream

  beforeEach(() => {
    stream = new ReadableStream({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode(str))
        controller.close()
      },
    })
  })

  it('should read full stream', async () => {
    const bytes = await readBytesFromStream(stream, {
      collectStreamBody: true,
    })

    expect(bytes?.length).toBe(27)
  })

  it('should read full stream without body', async () => {
    const bytes = await readBytesFromStream(stream, {
      collectStreamBody: false,
    })
    expect(bytes).toBeUndefined()
  })

  it('should handle rejection error on read', async () => {
    const stream = new ReadableStream({
      start: (controller) => {
        controller.error(new Error('foo'))
      },
    })

    try {
      await readBytesFromStream(stream, {
        collectStreamBody: true,
      })
      fail('Should have thrown an error')
    } catch (error) {
      expect(error).toEqual(jasmine.any(Error))
    }
  })

  it('should handle rejection error on cancel', async () => {
    const stream = new ReadableStream({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('f'))
        controller.close()
      },
      cancel: () => Promise.reject(new Error('foo')),
    })

    const bytes = await readBytesFromStream(stream, {
      collectStreamBody: true,
    })
    expect(bytes).toBeDefined()
  })
})
