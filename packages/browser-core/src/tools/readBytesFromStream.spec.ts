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
<<<<<<< HEAD
      await readBytesFromStream(stream)
      fail('Should have thrown an error')
=======
      await readBytesFromStream(stream, {
        collectStreamBody: true,
      })
      throw new Error('Should have thrown an error')
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
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
