import type { RawTelemetryEvent } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { noop, startFakeTelemetry } from '@datadog/browser-core'
import { MockWorker } from '../../../test'
import { DeflateEncoderStreamId, createDeflateEncoder } from './deflateEncoder'

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

  it('initializes the encoder with correct initial state', () => {
    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)

    expect(encoder.encodedBytes).toEqual(new Uint8Array(0))
    expect(encoder.encodedBytesCount).toBe(0)
    expect(encoder.rawBytesCount).toBe(0)
  })

  it('encodes data correctly', () => {
    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    encoder.write('foo', writeCallbackSpy)
    encoder.write('bar', writeCallbackSpy)

    expect(writeCallbackSpy).not.toHaveBeenCalled()

    worker.processAllMessages()

    expect(writeCallbackSpy).toHaveBeenCalledTimes(2)
    expect(encoder.encodedBytes).toEqual(new Uint8Array([...ENCODED_FOO, ...ENCODED_BAR, ...TRAILER]))
    expect(encoder.encodedBytesCount).toBe(7)
    expect(encoder.rawBytesCount).toBe(6)
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

  it('resets the stream', () => {
    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    encoder.write('foo', writeCallbackSpy)
    encoder.reset()
    encoder.write('bar', writeCallbackSpy)

    worker.processAllMessages()

    expect(writeCallbackSpy).toHaveBeenCalledTimes(2)
    expect(encoder.encodedBytes).toEqual(new Uint8Array([...ENCODED_BAR, ...TRAILER]))
    expect(encoder.encodedBytesCount).toBe(4)
    expect(encoder.rawBytesCount).toBe(3)
  })

  it('the encoder state stays available when the write callback is invoked', () => {
    const encoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
    encoder.write('foo', () => {
      expect(encoder.encodedBytes).toEqual(new Uint8Array([...ENCODED_FOO, ...TRAILER]))
      expect(encoder.encodedBytesCount).toBe(4)
      expect(encoder.rawBytesCount).toBe(3)
    })
    encoder.reset()

    worker.processAllMessages()
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
