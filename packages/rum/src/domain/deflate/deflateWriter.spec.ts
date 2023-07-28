import type { RawTelemetryEvent } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { noop, startFakeTelemetry } from '@datadog/browser-core'
import { MockWorker } from '../../../test'
import { StreamId, createDeflateWriter } from './deflateWriter'

const OTHER_STREAM_ID = 10 as StreamId

describe('createDeflateWriter', () => {
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

  it('initializes the writer with correct initial state', () => {
    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)

    expect(writer.compressedBytes).toEqual(new Uint8Array(0))
    expect(writer.compressedBytesCount).toBe(0)
    expect(writer.rawBytesCount).toBe(0)
  })

  it('writes data correctly', () => {
    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    writer.write('foo', writeCallbackSpy)
    writer.write('bar', writeCallbackSpy)

    expect(writeCallbackSpy).not.toHaveBeenCalled()

    worker.processAllMessages()

    expect(writeCallbackSpy).toHaveBeenCalledTimes(2)
    expect(writer.compressedBytes).toEqual(new Uint8Array([...ENCODED_FOO, ...ENCODED_BAR, ...TRAILER]))
    expect(writer.compressedBytesCount).toBe(7)
    expect(writer.rawBytesCount).toBe(6)
  })

  it('ignores messages destined to other streams', () => {
    // Lets assume another writer is writing something
    createDeflateWriter(configuration, worker, OTHER_STREAM_ID).write('foo', noop)

    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    writer.write('foo', writeCallbackSpy)

    // Process the first write action only
    worker.processNextMessage()

    expect(writeCallbackSpy).not.toHaveBeenCalled()
  })

  it('resets the stream', () => {
    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)
    const writeCallbackSpy = jasmine.createSpy()
    writer.write('foo', writeCallbackSpy)
    writer.reset()
    writer.write('bar', writeCallbackSpy)

    worker.processAllMessages()

    expect(writeCallbackSpy).toHaveBeenCalledTimes(2)
    expect(writer.compressedBytes).toEqual(new Uint8Array([...ENCODED_BAR, ...TRAILER]))
    expect(writer.compressedBytesCount).toBe(4)
    expect(writer.rawBytesCount).toBe(3)
  })

  it('the writer state stays available when the write callback is invoked', () => {
    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)
    writer.write('foo', () => {
      expect(writer.compressedBytes).toEqual(new Uint8Array([...ENCODED_FOO, ...TRAILER]))
      expect(writer.compressedBytesCount).toBe(4)
      expect(writer.rawBytesCount).toBe(3)
    })
    writer.reset()

    worker.processAllMessages()
  })

  it('unsubscribes from the worker responses come out of order', () => {
    const writer = createDeflateWriter(configuration, worker, StreamId.REPLAY)
    writer.write('foo', noop)
    writer.write('bar', noop)

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
