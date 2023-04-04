import sinon from 'sinon'
import type { PageExitEvent } from '../browser/pageExitObservable'
import { PageExitReason } from '../browser/pageExitObservable'
import { Observable } from '../tools/observable'
import type { FlushReason } from './batch'
import { Batch } from './batch'
import { createFlushController } from './flushController'
import type { HttpRequest } from './httpRequest'

describe('batch', () => {
  const BATCH_MESSAGES_LIMIT = 3
  const BATCH_BYTES_LIMIT = 100
  const MESSAGE_BYTES_LIMIT = 50 * 1024
  const FLUSH_TIMEOUT = 60 * 1000
  let batch: Batch
  let transport: {
    send: jasmine.Spy<HttpRequest['send']>
    sendOnExit: jasmine.Spy<HttpRequest['sendOnExit']>
  }

  let pageExitObservable: Observable<PageExitEvent>
  let flushNotifySpy: jasmine.Spy
  const flushReason: FlushReason = 'batch_bytes_limit'

  beforeEach(() => {
    transport = {
      send: jasmine.createSpy(),
      sendOnExit: jasmine.createSpy(),
    } satisfies HttpRequest
    pageExitObservable = new Observable()
    batch = new Batch(
      transport,
      createFlushController({
        batchMessagesLimit: BATCH_MESSAGES_LIMIT,
        batchBytesLimit: BATCH_BYTES_LIMIT,
        flushTimeout: FLUSH_TIMEOUT,
        pageExitObservable,
      }),
      MESSAGE_BYTES_LIMIT
    )
    flushNotifySpy = spyOn(batch.flushObservable, 'notify')
  })

  it('should add context to message', () => {
    batch.add({ message: 'hello' })

    batch.flush(flushReason)

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"hello"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })
  })

  it('should empty the batch after a flush', () => {
    batch.add({ message: 'hello' })

    batch.flush(flushReason)
    transport.send.calls.reset()
    batch.flush(flushReason)

    expect(transport.send).not.toHaveBeenCalled()
  })

  it('should flush when the message count limit is reached', () => {
    batch.add({ message: '1' })
    batch.add({ message: '2' })
    batch.add({ message: '3' })
    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"1"}\n{"message":"2"}\n{"message":"3"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })
  })

  it('should flush when a new message will overflow the bytes limit', () => {
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).not.toHaveBeenCalled()

    batch.add({ message: '60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).toHaveBeenCalledWith({
      data: '{"message":"50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx"}',
      bytesCount: 50,
      flushReason,
    })

    batch.flush(flushReason)
    expect(transport.send).toHaveBeenCalledWith({
      data: '{"message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
      bytesCount: 60,
      flushReason,
    })
  })

  it('should consider separators when computing the byte count', () => {
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 30 sep: 0
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 60 sep: 1
    batch.add({ message: '39 bytes - xxxxxxxxxxxxxx' }) // batch: 99 sep: 2

    expect(transport.send).toHaveBeenCalledWith({
      data: '{"message":"30 bytes - xxxxx"}\n{"message":"30 bytes - xxxxx"}',
      bytesCount: 61,
      flushReason,
    })
  })

  it('should call send one time when the byte count is too high and the batch is empty', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledWith({ data: `{"message":"${message}"}`, bytesCount: 101, flushReason })
  })

  it('should flush the batch and send the message when the message is too heavy', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('should flush after timeout', () => {
    const clock = sinon.useFakeTimers()
    batch = new Batch(
      transport,
      createFlushController({
        batchMessagesLimit: BATCH_MESSAGES_LIMIT,
        batchBytesLimit: BATCH_BYTES_LIMIT,
        flushTimeout: 10,
        pageExitObservable,
      }),
      MESSAGE_BYTES_LIMIT
    )
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    clock.tick(100)

    expect(transport.send).toHaveBeenCalled()

    clock.restore()
  })

  it('should flush on page exit', () => {
    batch.add({ message: '1' })
    pageExitObservable.notify({ reason: PageExitReason.UNLOADING })
    expect(transport.sendOnExit).toHaveBeenCalledTimes(1)
  })

  it('should not send a message with a bytes size above the limit', () => {
    const warnStub = sinon.stub(console, 'warn')
    batch = new Batch(
      transport,
      createFlushController({
        batchMessagesLimit: BATCH_MESSAGES_LIMIT,
        batchBytesLimit: BATCH_BYTES_LIMIT,
        flushTimeout: FLUSH_TIMEOUT,
        pageExitObservable,
      }),
      50
    )
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })

    expect(transport.send).not.toHaveBeenCalled()
    warnStub.restore()
  })

  it('should upsert a message for a given key', () => {
    batch.upsert({ message: '1' }, 'a')
    batch.upsert({ message: '2' }, 'a')
    batch.upsert({ message: '3' }, 'b')
    batch.upsert({ message: '4' }, 'c')

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"2"}\n{"message":"3"}\n{"message":"4"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"5"}\n{"message":"6"}\n{"message":"7"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    batch.flush(flushReason)

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"10"}\n{"message":"11"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })
  })

  it('should be able to use telemetry in the httpRequest.send', () => {
    const fakeRequest = {
      send(data: string) {
        addTelemetryDebugFake()
        transport.send({ data, bytesCount: BATCH_BYTES_LIMIT, flushReason })
      },
    } as unknown as HttpRequest
    const batch = new Batch(
      fakeRequest,
      createFlushController({
        batchMessagesLimit: BATCH_MESSAGES_LIMIT,
        batchBytesLimit: BATCH_BYTES_LIMIT,
        flushTimeout: FLUSH_TIMEOUT,
        pageExitObservable,
      }),
      MESSAGE_BYTES_LIMIT
    )
    const addTelemetryDebugFake = () => batch.add({ message: 'telemetry message' })

    batch.add({ message: 'normal message' })
    batch.flush(flushReason)
    expect(transport.send).toHaveBeenCalledTimes(1)
    batch.flush(flushReason)
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('should notify when the batch is flushed', () => {
    batch.add({})
    batch.flush(flushReason)
    expect(flushNotifySpy).toHaveBeenCalledOnceWith({ bufferBytesCount: 2, bufferMessagesCount: 1 })
  })
})
