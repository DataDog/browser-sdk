import { beforeEach, describe, expect, it } from 'vitest'
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
    const bytes = await readBytesFromStream(stream)

    expect(bytes.length).toBe(27)
  })

  it('should handle rejection error on read', async () => {
    const stream = new ReadableStream({
      start: (controller) => {
        controller.error(new Error('foo'))
      },
    })

    try {
      await readBytesFromStream(stream)
      throw new Error('Should have thrown an error')
    } catch (error) {
      expect(error).toEqual(expect.any(Error))
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

    const bytes = await readBytesFromStream(stream)
    expect(bytes).toBeDefined()
  })
})
