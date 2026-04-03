import type { EncoderResult } from './encoder'
import { createDeflateEncoder, createIdentityEncoder } from './encoder'

describe('createIdentityEncoder', () => {
  it('isAsync is false', () => {
    const encoder = createIdentityEncoder()
    expect(encoder.isAsync).toBe(false)
  })

  it('write() + finish() returns the written data', (done) => {
    const encoder = createIdentityEncoder()
    encoder.write('hello')
    encoder.finish((result: EncoderResult) => {
      expect(result.output).toBe('hello')
      expect(result.outputBytesCount).toBeGreaterThan(0)
      expect(result.pendingData).toBe('')
      done()
    })
  })

  it('multiple write() calls join with newline', (done) => {
    const encoder = createIdentityEncoder()
    encoder.write('foo')
    encoder.write('bar')
    encoder.write('baz')
    encoder.finish((result: EncoderResult) => {
      expect(result.output).toBe('foo\nbar\nbaz')
      done()
    })
  })

  it('finish() resets the buffer', (done) => {
    const encoder = createIdentityEncoder()
    encoder.write('first')
    encoder.finish(() => {
      encoder.write('second')
      encoder.finish((result: EncoderResult) => {
        expect(result.output).toBe('second')
        done()
      })
    })
  })

  it('finishSync() returns same result as finish()', () => {
    const encoder = createIdentityEncoder()
    encoder.write('hello')
    const result = encoder.finishSync()
    expect(result.output).toBe('hello')
    expect(result.outputBytesCount).toBeGreaterThan(0)
    expect(result.pendingData).toBe('')
  })

  it('write() calls the callback', () => {
    const encoder = createIdentityEncoder()
    const callback = jasmine.createSpy('callback')
    encoder.write('data', callback)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})

describe('createDeflateEncoder', () => {
  it('isAsync is true', () => {
    const encoder = createDeflateEncoder()
    expect(encoder.isAsync).toBe(true)
  })

  it('write() calls the callback', () => {
    const encoder = createDeflateEncoder()
    const callback = jasmine.createSpy('callback')
    encoder.write('data', callback)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('finish() result has encoding: deflate', (done) => {
    const encoder = createDeflateEncoder()
    encoder.write('hello')
    encoder.finish((result: EncoderResult) => {
      expect(result.encoding).toBe('deflate')
      expect(result.pendingData).toBe('')
      done()
    })
  })

  it('write() + finish() produces compressed output for large data', (done) => {
    const encoder = createDeflateEncoder()
    const largeInput = 'aaaaaaaaaa'.repeat(200)
    encoder.write(largeInput)
    encoder.finish((result: EncoderResult) => {
      expect(result.outputBytesCount).toBeLessThan(largeInput.length)
      done()
    })
  })

  it('compressed output can be decompressed back to original', (done) => {
    if (typeof DecompressionStream === 'undefined') {
      pending('DecompressionStream not available')
      return
    }

    const encoder = createDeflateEncoder()
    const input = 'hello world from the deflate encoder'
    encoder.write(input)
    encoder.finish(async (result: EncoderResult) => {
      const compressed = result.output as Uint8Array<ArrayBuffer>
      const stream = new DecompressionStream('deflate')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()

      writer.write(compressed)
      writer.close()

      const chunks: Uint8Array<ArrayBuffer>[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value as Uint8Array<ArrayBuffer>)
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const output = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        output.set(chunk, offset)
        offset += chunk.length
      }

      const decoded = new TextDecoder().decode(output)
      expect(decoded).toBe(input)
      done()
    })
  })

  it('finishSync() returns pending data uncompressed with empty output', () => {
    const encoder = createDeflateEncoder()
    encoder.write('some data')
    const result = encoder.finishSync()
    expect(result.output).toBe('')
    expect(result.outputBytesCount).toBe(0)
    expect(result.encoding).toBe('deflate')
    expect(result.pendingData).toBe('some data')
  })
})
