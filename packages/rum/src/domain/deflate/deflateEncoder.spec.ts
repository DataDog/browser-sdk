import type { RawTelemetryEvent, EncoderResult } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { noop, startFakeTelemetry, DeflateEncoderStreamId } from '@datadog/browser-core'
import { MockWorker } from '../../../test'
import { createDeflateEncoder } from './deflateEncoder'

const OTHER_STREAM_ID = 10 as DeflateEncoderStreamId

describe('createDeflateEncoder', () => {
  const configuration = {} as RumConfiguration
  let worker: MockWorker
  let telemetryEvents: RawTelemetryEvent[]

  const ENCODED_FOO = [102, 111, 111]
  const ENCODED_BAR = [98, 97, 114]
  const TRAILER = [32]

  beforeEach(() => {
    worker = new MockWorker()
    telemetryEvents = startFakeTelemetry()
  })

  describe('write()', () => {
    it('invokes write callbacks', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const writeCallbackSpy = jasmine.createSpy()
      encoder.write('foo', writeCallbackSpy)
      encoder.write('bar', writeCallbackSpy)

      expect(writeCallbackSpy).not.toHaveBeenCalled()

      worker.processAllMessages()

      expect(writeCallbackSpy).toHaveBeenCalledTimes(2)
      expect(writeCallbackSpy.calls.argsFor(0)).toEqual([3])
      expect(writeCallbackSpy.calls.argsFor(1)).toEqual([3])
    })

    it('marks the encoder as not empty', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      encoder.write('foo')
      expect(encoder.isEmpty).toBe(false)
    })
  })

  describe('finish()', () => {
    it('invokes the callback with the encoded data', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const finishCallbackSpy = jasmine.createSpy<(result: EncoderResult<Uint8Array>) => void>()
      encoder.write('foo')
      encoder.write('bar')
      encoder.finish(finishCallbackSpy)

      worker.processAllMessages()

      expect(finishCallbackSpy).toHaveBeenCalledOnceWith({
        output: new Uint8Array([...ENCODED_FOO, ...ENCODED_BAR, ...TRAILER]),
        outputBytesCount: 7,
        rawBytesCount: 6,
        encoding: 'deflate',
      })
    })

    it('invokes the callback even if nothing has been written', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const finishCallbackSpy = jasmine.createSpy<(result: EncoderResult<Uint8Array>) => void>()
      encoder.finish(finishCallbackSpy)

      expect(finishCallbackSpy).toHaveBeenCalledOnceWith({
        output: new Uint8Array(0),
        outputBytesCount: 0,
        rawBytesCount: 0,
        encoding: 'deflate',
      })
    })

    it('cancels pending write callbacks', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const writeCallbackSpy = jasmine.createSpy()
      encoder.write('foo', writeCallbackSpy)
      encoder.write('bar', writeCallbackSpy)
      encoder.finish(noop)

      worker.processAllMessages()

      expect(writeCallbackSpy).not.toHaveBeenCalled()
    })

    it('marks the encoder as empty', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      encoder.write('foo')
      encoder.finish(noop)
      expect(encoder.isEmpty).toBe(true)
    })

    it('supports calling finish() while another finish() call is pending', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const finishCallbackSpy = jasmine.createSpy<(result: EncoderResult<Uint8Array>) => void>()
      encoder.write('foo')
      encoder.finish(finishCallbackSpy)
      encoder.write('bar')
      encoder.finish(finishCallbackSpy)

      worker.processAllMessages()

      expect(finishCallbackSpy).toHaveBeenCalledTimes(2)
      expect(finishCallbackSpy.calls.allArgs()).toEqual([
        [
          {
            output: new Uint8Array([...ENCODED_FOO, ...TRAILER]),
            outputBytesCount: 4,
            rawBytesCount: 3,
            encoding: 'deflate',
          },
        ],
        [
          {
            output: new Uint8Array([...ENCODED_BAR, ...TRAILER]),
            outputBytesCount: 4,
            rawBytesCount: 3,
            encoding: 'deflate',
          },
        ],
      ])
    })
  })

  describe('finishSync()', () => {
    it('returns the encoded data up to this point and any pending data', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      encoder.write('foo')
      encoder.write('bar')

      worker.processNextMessage()

      expect(encoder.finishSync()).toEqual({
        output: new Uint8Array([...ENCODED_FOO, ...TRAILER]),
        outputBytesCount: 4,
        rawBytesCount: 3,
        pendingData: 'bar',
        encoding: 'deflate',
      })
    })

    it('cancels pending write callbacks', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const writeCallbackSpy = jasmine.createSpy()
      encoder.write('foo', writeCallbackSpy)
      encoder.write('bar', writeCallbackSpy)
      encoder.finishSync()

      worker.processAllMessages()

      expect(writeCallbackSpy).not.toHaveBeenCalled()
    })

    it('marks the encoder as empty', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      encoder.write('foo')
      encoder.finishSync()
      expect(encoder.isEmpty).toBe(true)
    })

    it('supports calling finishSync() while another finish() call is pending', () => {
      const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
      const finishCallbackSpy = jasmine.createSpy<(result: EncoderResult<Uint8Array>) => void>()
      encoder.write('foo')
      encoder.finish(finishCallbackSpy)
      encoder.write('bar')
      expect(encoder.finishSync()).toEqual({
        output: new Uint8Array(0),
        outputBytesCount: 0,
        rawBytesCount: 0,
        pendingData: 'foobar',
        encoding: 'deflate',
      })

      worker.processAllMessages()

      expect(finishCallbackSpy).not.toHaveBeenCalled()
    })
  })

  it('ignores messages destined to other streams', () => {
    // Let's assume another encoder is sending something to the worker
    createDeflateEncoder(configuration, worker, OTHER_STREAM_ID).write('foo', noop)

    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    encoder.write('foo', writeCallbackSpy)

    // Process the first write action only
    worker.processNextMessage()

    expect(writeCallbackSpy).not.toHaveBeenCalled()
  })

  it('unsubscribes from the worker responses come out of order', () => {
    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    encoder.write('foo', noop)
    encoder.write('bar', noop)

    worker.dropNextMessage() // drop the first write action
    worker.processAllMessages()

    expect(worker.messageListenersCount).toBe(0)
    expect(telemetryEvents).toEqual([
      {
        type: 'log',
        message: 'Worker responses received out of order.',
        status: 'debug',
      },
    ])
  })
})
