import type { MockFlushController } from '../../test'
import { createMockFlushController } from '../../test'
import { display } from '../tools/display'
import { Batch } from './batch'
import type { FlushReason } from './flushController'
import type { HttpRequest } from './httpRequest'

describe('batch', () => {
  const MESSAGE_BYTES_LIMIT = 50

  const BIG_MESSAGE_OVER_BYTES_LIMIT = { message: 'hello xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
  const SMALL_MESSAGE = { message: 'hello' }
  const SMALL_MESSAGE_BYTES_COUNT = 19
  const SEPARATOR_BYTES_COUNT = 1

  let batch: Batch
  let transport: {
    send: jasmine.Spy<HttpRequest['send']>
    sendOnExit: jasmine.Spy<HttpRequest['sendOnExit']>
  }

  const flushReason: FlushReason = 'bytes_limit'
  let flushController: MockFlushController

  beforeEach(() => {
    transport = {
      send: jasmine.createSpy(),
      sendOnExit: jasmine.createSpy(),
    } satisfies HttpRequest
    flushController = createMockFlushController()
    batch = new Batch(transport, flushController, MESSAGE_BYTES_LIMIT)
  })

  it('should send a message', () => {
    batch.add(SMALL_MESSAGE)

    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"hello"}',
      bytesCount: SMALL_MESSAGE_BYTES_COUNT,
      flushReason,
    })
  })

  it('should add message to the flush controller', () => {
    batch.add(SMALL_MESSAGE)

    expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledOnceWith(SMALL_MESSAGE_BYTES_COUNT)
    expect(flushController.notifyAfterAddMessage).toHaveBeenCalledOnceWith()
  })

  it('should consider separators when adding message', () => {
    batch.add(SMALL_MESSAGE)
    batch.add(SMALL_MESSAGE)
    batch.add(SMALL_MESSAGE)

    expect(flushController.notifyBeforeAddMessage.calls.allArgs()).toEqual([
      [SMALL_MESSAGE_BYTES_COUNT],
      [SMALL_MESSAGE_BYTES_COUNT + SEPARATOR_BYTES_COUNT],
      [SMALL_MESSAGE_BYTES_COUNT + SEPARATOR_BYTES_COUNT],
    ])
  })

  it('should consider separators when replacing messages', () => {
    batch.add(SMALL_MESSAGE)
    batch.upsert(SMALL_MESSAGE, 'a')

    flushController.notifyBeforeAddMessage.calls.reset()

    batch.upsert(SMALL_MESSAGE, 'a')

    expect(flushController.notifyAfterRemoveMessage).toHaveBeenCalledOnceWith(
      SMALL_MESSAGE_BYTES_COUNT + SEPARATOR_BYTES_COUNT
    )
    expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledOnceWith(
      SMALL_MESSAGE_BYTES_COUNT + SEPARATOR_BYTES_COUNT
    )
  })

  it('should not send a message with a bytes size above the limit', () => {
    const warnSpy = spyOn(display, 'warn')
    batch.add(BIG_MESSAGE_OVER_BYTES_LIMIT)

    expect(warnSpy).toHaveBeenCalled()
    expect(flushController.notifyBeforeAddMessage).not.toHaveBeenCalled()
  })

  it('should upsert a message for a given key', () => {
    batch.upsert({ message: '1' }, 'a')
    batch.upsert({ message: '2' }, 'a')
    batch.upsert({ message: '3' }, 'b')
    batch.upsert({ message: '4' }, 'c')
    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"2"}\n{"message":"3"}\n{"message":"4"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')
    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"5"}\n{"message":"6"}\n{"message":"7"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"10"}\n{"message":"11"}',
      bytesCount: jasmine.any(Number),
      flushReason,
    })
  })

  it('should be able to use telemetry in the httpRequest.send', () => {
    transport.send.and.callFake(() => {
      addTelemetryDebugFake()
    })
    const addTelemetryDebugFake = () => batch.add({ message: 'telemetry message' })

    batch.add({ message: 'normal message' })
    expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledTimes(1)

    flushController.notifyFlush()
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledTimes(2)

    flushController.notifyFlush()
    expect(transport.send).toHaveBeenCalledTimes(2)
  })
})
