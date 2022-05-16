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

  beforeEach(() => {
    transport = { send: noop } as unknown as HttpRequest
    spyOn(transport, 'send')
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, FLUSH_TIMEOUT)
  })

  it('should add context to message', () => {
    batch.add({ message: 'hello' })

    batch.flush()

    expect(transport.send).toHaveBeenCalledWith('{"message":"hello"}', jasmine.any(Number), undefined)
  })

  it('should empty the batch after a flush', () => {
    batch.add({ message: 'hello' })

    batch.flush()
    ;(transport.send as jasmine.Spy).calls.reset()
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
    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"1"}\n{"message":"2"}\n{"message":"3"}',
      jasmine.any(Number),
      'batch_messages_limit'
    )
  })

  it('should flush when a new message will overflow the bytes limit', () => {
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).not.toHaveBeenCalled()

    batch.add({ message: '60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx"}',
      50,
      'batch_bytes_limit'
    )

    batch.flush()
    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}',
      60,
      undefined
    )
  })

  it('should consider separators when computing the byte count', () => {
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 30 sep: 0
    batch.add({ message: '30 bytes - xxxxx' }) // batch: 60 sep: 1
    batch.add({ message: '39 bytes - xxxxxxxxxxxxxx' }) // batch: 99 sep: 2

    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"30 bytes - xxxxx"}\n{"message":"30 bytes - xxxxx"}',
      61,
      jasmine.any(String)
    )
  })

  it('should call send one time when the byte count is too high and the batch is empty', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledWith(`{"message":"${message}"}`, 101, jasmine.any(String))
  })

  it('should flush the batch and send the message when the message is too heavy', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('should flush after timeout', () => {
    const clock = sinon.useFakeTimers()
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, 10)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxxxxxxxxxxxxxx' })
    clock.tick(100)

    expect(transport.send).toHaveBeenCalled()

    clock.restore()
  })

  it('should not send a message with a bytes size above the limit', () => {
    const warnStub = sinon.stub(console, 'warn')
    batch = new Batch(transport, BATCH_MESSAGES_LIMIT, BATCH_BYTES_LIMIT, 50, FLUSH_TIMEOUT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })

    expect(transport.send).not.toHaveBeenCalled()
    warnStub.restore()
  })

  it('should upsert a message for a given key', () => {
    batch.upsert({ message: '1' }, 'a')
    batch.upsert({ message: '2' }, 'a')
    batch.upsert({ message: '3' }, 'b')
    batch.upsert({ message: '4' }, 'c')

    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"2"}\n{"message":"3"}\n{"message":"4"}',
      jasmine.any(Number),
      jasmine.any(String)
    )

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')

    expect(transport.send).toHaveBeenCalledWith(
      '{"message":"5"}\n{"message":"6"}\n{"message":"7"}',
      jasmine.any(Number),
      jasmine.any(String)
    )

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    batch.flush()

    expect(transport.send).toHaveBeenCalledWith('{"message":"10"}\n{"message":"11"}', jasmine.any(Number), undefined)
  })
})
