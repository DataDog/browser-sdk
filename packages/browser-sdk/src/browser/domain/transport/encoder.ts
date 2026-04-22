interface EncoderResult {
  output: string | Uint8Array
  outputBytesCount: number
  encoding?: 'deflate'
  pendingData: string
}

interface Encoder {
  readonly isAsync: boolean
  write(data: string, callback?: () => void): void
  finish(callback: (result: EncoderResult) => void): void
  finishSync(): EncoderResult
}

function createIdentityEncoder(): Encoder {
  let buffer = ''

  return {
    isAsync: false,

    write(data: string, callback?: () => void) {
      buffer += (buffer ? '\n' : '') + data
      if (callback) callback()
    },

    finish(callback: (result: EncoderResult) => void) {
      const output = buffer
      buffer = ''
      callback({
        output,
        outputBytesCount: new Blob([output]).size,
        pendingData: '',
      })
    },

    finishSync(): EncoderResult {
      const output = buffer
      buffer = ''
      return {
        output,
        outputBytesCount: new Blob([output]).size,
        pendingData: '',
      }
    },
  }
}

function createDeflateEncoder(): Encoder {
  let chunks: string[] = []

  return {
    isAsync: true,

    write(data: string, callback?: () => void) {
      chunks.push(data)
      if (callback) callback()
    },

    finish(callback: (result: EncoderResult) => void) {
      const input = chunks.join('\n')
      chunks = []

      if (typeof CompressionStream === 'undefined') {
        callback({
          output: input,
          outputBytesCount: new Blob([input]).size,
          encoding: 'deflate',
          pendingData: '',
        })
        return
      }

      const stream = new CompressionStream('deflate')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()

      const encoded = new TextEncoder().encode(input)
      writer.write(encoded as unknown as Uint8Array<ArrayBuffer>).then(() => writer.close())

      const outputChunks: Uint8Array<ArrayBuffer>[] = []

      function readNext() {
        reader.read().then(({ done, value }) => {
          if (done) {
            const totalLength = outputChunks.reduce((sum, chunk) => sum + chunk.length, 0)
            const output = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of outputChunks) {
              output.set(chunk, offset)
              offset += chunk.length
            }
            callback({
              output,
              outputBytesCount: output.byteLength,
              encoding: 'deflate',
              pendingData: '',
            })
          } else {
            outputChunks.push(value as Uint8Array<ArrayBuffer>)
            readNext()
          }
        })
      }

      readNext()
    },

    finishSync(): EncoderResult {
      const pending = chunks.join('\n')
      chunks = []
      return {
        output: '',
        outputBytesCount: 0,
        encoding: 'deflate',
        pendingData: pending,
      }
    },
  }
}

export type { EncoderResult, Encoder }
export { createIdentityEncoder, createDeflateEncoder }
