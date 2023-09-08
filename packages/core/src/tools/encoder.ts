import { computeBytesCount } from './utils/byteUtils'

export interface Encoder<Output extends string | Uint8Array = string | Uint8Array> {
  /**
   * Whether this encoder might call the provided callbacks asynchronously
   */
  isAsync: boolean

  /**
   * Whether some data has been written since the last finish() or finishSync() call
   */
  isEmpty: boolean

  /**
   * Write a string to be encoded.
   *
   * This operation can be synchronous or asynchronous depending on the encoder implementation.
   *
   * If specified, the callback will be invoked when the operation finishes, unless the operation is
   * asynchronous and finish() or finishSync() is called in the meantime.
   */
  write(data: string, callback?: (additionalEncodedBytesCount: number) => void): void

  /**
   * Waits for pending data to be encoded and resets the encoder state.
   *
   * This operation can be synchronous or asynchronous depending on the encoder implementation.
   *
   * The callback will be invoked when the operation finishes, unless the operation is asynchronous
   * and another call to finish() or finishSync() occurs in the meantime.
   */
  finish(callback: (result: EncoderResult<Output>) => void): void

  /**
   * Resets the encoder state then returns the encoded data and any potential pending data directly,
   * discarding all pending write operations and finish() callbacks.
   */
  finishSync(): EncoderResult<Output> & { pendingData: string }

  /**
   * Returns a rough estimation of the bytes count if the data was encoded.
   */
  estimateEncodedBytesCount(data: string): number
}

export interface EncoderResult<Output extends string | Uint8Array = string | Uint8Array> {
  output: Output
  outputBytesCount: number

  /**
   * An encoding type supported by HTTP Content-Encoding, if applicable.
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding#directives
   */
  encoding?: 'deflate'

  /**
   * Total bytes count of the input strings encoded to UTF-8.
   */
  rawBytesCount: number
}

export function createIdentityEncoder(): Encoder<string> {
  let output = ''
  let outputBytesCount = 0

  return {
    isAsync: false,

    get isEmpty() {
      return !output
    },

    write(data, callback) {
      const additionalEncodedBytesCount = computeBytesCount(data)
      outputBytesCount += additionalEncodedBytesCount
      output += data
      if (callback) {
        callback(additionalEncodedBytesCount)
      }
    },

    finish(callback) {
      callback(this.finishSync())
    },

    finishSync() {
      const result = {
        output,
        outputBytesCount,
        rawBytesCount: outputBytesCount,
        pendingData: '',
      }
      output = ''
      outputBytesCount = 0
      return result
    },

    estimateEncodedBytesCount(data) {
      return data.length
    },
  }
}
