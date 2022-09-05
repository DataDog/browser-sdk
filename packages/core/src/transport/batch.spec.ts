/* eslint-disable @typescript-eslint/unbound-method */
import sinon from 'sinon'
import { noop } from '../tools/utils'
import { Batch } from './batch'
import type { HttpRequest } from './httpRequest'

describe('batch', () => {
  const BATCH_MESSAGES_LIMIT = 3
  const BATCH_BYTES_LIMIT = 100
  const MESSAGE_BYTES_LIMIT = 50 * 1024
  const FLUSH_TIMEOUT = 60 * 1000
  let batch: Batch
  let transport: HttpRequest
  let sendSpy: jasmine.Spy<HttpRequest['send']>

  beforeEach(() => {
    transport = { send: noop } as unknown as HttpRequest
    sendSpy = spyOn(transport, 'send')
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, FLUSH_TIMEOUT)
  })

  it('should add context to message', () => {
    batch.add({ message: 'hello' })

    batch.flush()

    expect(sendSpy.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"hello"}',
      bytesCount: jasmine.any(Number),
    })
  })

  it('should empty the batch after a flush', () => {
    batch.add({ message: 'hello' })

    batch.flush()
    sendSpy.calls.reset()
    batch.flush()

    expect(transport.send).not.toHaveBeenCalled()
  })

  it('should count the bytes of a message composed of 1 byte characters', () => {
    expect(batch.computeBytesCount('1234')).toEqual(4)
  })

  it('should count the bytes of a message composed of multiple bytes characters', () => {
    expect(batch.computeBytesCount('🪐')).toEqual(4)
  })

  it('should flush when the message count limit is reached', () => {
    batch.add({ message: '1' })
    batch.add({ message: '2' })
    batch.add({ message: '3' })
    expect(sendSpy.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"1"}\n{"message":"2"}\n{"message":"3"}',
      bytesCount: jasmine.any(Number),
    })
  })

  it('should flush when a new message will overflow the bytes limit', () => {
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(sendSpy).not.toHaveBeenCalled()

    batch.add({ message: '60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(sendSpy).toHaveBeenCalledWith({ data: '{"message":"50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx"}', bytesCount: 50 })

    batch.flush()
    expect(sendSpy).toHaveBeenCalledWith({
      data: '{"message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
      bytesCount: 60,
    })
  })

  it('should consider separators when computing the byte count', () => {
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 30 sep: 0
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 60 sep: 1
    batch.add({ message: '39 bytes - xxxxxxxxxxxxxx' }) // batch: 99 sep: 2

    expect(sendSpy).toHaveBeenCalledWith({
      data: '{"message":"30 bytes - xxxxx"}\n{"message":"30 bytes - xxxxx"}',
      bytesCount: 61,
    })
  })

  it('should call send one time when the byte count is too high and the batch is empty', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    batch.add({ message })
    expect(sendSpy).toHaveBeenCalledWith({ data: `{"message":"${message}"}`, bytesCount: 101 })
  })

  it('should flush the batch and send the message when the message is too heavy', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    batch.add({ message })
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })

  it('should flush after timeout', () => {
    const clock = sinon.useFakeTimers()
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, 10)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    clock.tick(100)

    expect(sendSpy).toHaveBeenCalled()

    clock.restore()
  })

  it('should not send a message with a bytes size above the limit', () => {
    const warnStub = sinon.stub(console, 'warn')
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, 50, FLUSH_TIMEOUT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })

    expect(sendSpy).not.toHaveBeenCalled()
    warnStub.restore()
  })

  it('should upsert a message for a given key', () => {
    batch.upsert({ message: '1' }, 'a')
    batch.upsert({ message: '2' }, 'a')
    batch.upsert({ message: '3' }, 'b')
    batch.upsert({ message: '4' }, 'c')

    expect(sendSpy.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"2"}\n{"message":"3"}\n{"message":"4"}',
      bytesCount: jasmine.any(Number),
    })

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')

    expect(sendSpy.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"5"}\n{"message":"6"}\n{"message":"7"}',
      bytesCount: jasmine.any(Number),
    })

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    batch.flush()

    expect(sendSpy.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"10"}\n{"message":"11"}',
      bytesCount: jasmine.any(Number),
    })
  })

  it('should be able to use telemetry in the httpRequest.send', () => {
    const fakeRequest = {
      send(data: string) {
        addTelemetryDebugFake()
        transport.send({ data, bytesCount: BATCH_BYTES_LIMIT })
      },
    } as unknown as HttpRequest
    const batch = new Batch(fakeRequest, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, FLUSH_TIMEOUT)
    const addTelemetryDebugFake = () => batch.add({ message: 'telemetry message' })

    batch.add({ message: 'normal message' })
    batch.flush()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    batch.flush()
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })
})
