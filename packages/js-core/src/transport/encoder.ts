import type { Uint8ArrayBuffer } from '../util/byteUtils'
import { computeBytesCount } from '../util/byteUtils'

/**
 * A generic encoding abstraction used by the batch transport layer to serialise
 * outgoing payloads before sending them to the intake.
 *
 * Implementations may be synchronous (e.g. the identity encoder) or asynchronous
 * (e.g. a deflate encoder backed by a Web Worker). Callers should check `isAsync`
 * and handle both cases via `finish` / `finishSync` accordingly.
 *
 * @typeParam Output - The encoded output type: `string` for text encoders,
 * `Uint8ArrayBuffer` for binary ones.
 */
export interface Encoder<Output extends string | Uint8ArrayBuffer = string | Uint8ArrayBuffer> {
  /**
   * Whether this encoder may call `write` callbacks or `finish` callbacks asynchronously.
   * When `false`, all callbacks are guaranteed to be invoked synchronously.
   */
  isAsync: boolean

  /**
   * `true` when no data has been written since the last `finish()` or `finishSync()` call.
   */
  isEmpty: boolean

  /**
   * Encodes `data` and appends it to the internal buffer.
   *
   * If provided, `callback` is called with the number of additional bytes added to the encoded
   * output. For asynchronous encoders the callback may be deferred; it will not be called if
   * `finish()` or `finishSync()` is invoked before encoding completes.
   *
   * @param data - The string to encode.
   * @param callback - Optional callback receiving the encoded byte delta.
   */
  write(data: string, callback?: (additionalEncodedBytesCount: number) => void): void

  /**
   * Waits for any pending encodes and flushes the buffer, then invokes `callback` with the
   * result. Resets the encoder state so it is ready for the next batch.
   *
   * For asynchronous encoders the callback may be deferred. It will not be called if another
   * `finish()` or `finishSync()` call is made before encoding completes.
   *
   * @param callback - Called with the completed {@link EncoderResult}.
   */
  finish(callback: (result: EncoderResult<Output>) => void): void

  /**
   * Immediately flushes the buffer and returns the result, discarding any pending asynchronous
   * encode operations and `finish()` callbacks. Resets the encoder state.
   *
   * @returns The {@link EncoderResult} along with any data that was still pending (not yet encoded)
   * at the time of the call.
   */
  finishSync(): EncoderResult<Output> & { pendingData: string }

  /**
   * Returns a rough estimate of how many bytes `data` would occupy once encoded.
   * Used to make batching decisions before the actual encoding is complete.
   *
   * @param data - The string to estimate.
   * @returns Estimated encoded byte count.
   */
  estimateEncodedBytesCount(data: string): number
}

/**
 * The result produced by {@link Encoder.finish} or {@link Encoder.finishSync}.
 *
 * @typeParam Output - The encoded output type: `string` or `Uint8ArrayBuffer`.
 */
export interface EncoderResult<Output extends string | Uint8ArrayBuffer = string | Uint8ArrayBuffer> {
  /** The encoded output. */
  output: Output

  /** Byte count of `output`. */
  outputBytesCount: number

  /**
   * HTTP `Content-Encoding` value for the encoded data, if applicable.
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding#directives
   */
  encoding?: 'deflate'

  /** Total byte count of the raw (pre-encoding) input strings, encoded as UTF-8. */
  rawBytesCount: number
}

/**
 * Creates a synchronous identity encoder that stores data as plain UTF-8 strings with no
 * compression.
 *
 * Use this as the default encoder when no deflate / compression worker is available.
 *
 * @returns A synchronous {@link Encoder} whose `output` is always a `string`.
 */
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
