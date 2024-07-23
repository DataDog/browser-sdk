import type { MockFlushController } from '../../test'
import { createMockFlushController } from '../../test'
import { display } from '../tools/display'
import type { Encoder } from '../tools/encoder'
import { createIdentityEncoder } from '../tools/encoder'
import { batchFactory, type Batch } from './batch'
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

  let flushController: MockFlushController
  let encoder: Encoder<string>

  beforeEach(() => {
    transport = {
      send: jasmine.createSpy(),
      sendOnExit: jasmine.createSpy(),
    } satisfies HttpRequest
    flushController = createMockFlushController()
    encoder = createIdentityEncoder()
    batch = batchFactory({ encoder, request: transport, flushController, messageBytesLimit: MESSAGE_BYTES_LIMIT })
  })

  it('should send a message', () => {
    batch.add(SMALL_MESSAGE)

    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"hello"}',
      bytesCount: SMALL_MESSAGE_BYTES_COUNT,
      encoding: undefined,
    })
  })

  describe('adding a message', () => {
    it('should add message to the flush controller', () => {
      batch.add(SMALL_MESSAGE)

      expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledOnceWith(SMALL_MESSAGE_BYTES_COUNT)
      expect(flushController.notifyAfterAddMessage).toHaveBeenCalledOnceWith(0)
    })

    it('should consider separators when adding message', () => {
      batch.add(SMALL_MESSAGE)
      batch.add(SMALL_MESSAGE)
      batch.add(SMALL_MESSAGE)

      expect(flushController.bytesCount).toEqual(
        SMALL_MESSAGE_BYTES_COUNT +
          SEPARATOR_BYTES_COUNT +
          SMALL_MESSAGE_BYTES_COUNT +
          SEPARATOR_BYTES_COUNT +
          SMALL_MESSAGE_BYTES_COUNT
      )
    })

    it('should remove the estimated message bytes count when replacing a message', () => {
      batch.add(SMALL_MESSAGE)
      batch.upsert(SMALL_MESSAGE, 'a')

      flushController.notifyBeforeAddMessage.calls.reset()

      batch.upsert(SMALL_MESSAGE, 'a')

      expect(flushController.notifyAfterRemoveMessage).toHaveBeenCalledOnceWith(SMALL_MESSAGE_BYTES_COUNT)
      expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledOnceWith(SMALL_MESSAGE_BYTES_COUNT)
      expect(flushController.bytesCount).toEqual(
        // Note: contrary to added messages (see test above), we don't take separators into account
        // when upserting messages, because it's irrelevant: upserted messages size are not yet
        // encoded so the bytes count is only an estimation
        SMALL_MESSAGE_BYTES_COUNT + SMALL_MESSAGE_BYTES_COUNT
      )
    })

    it('should not send a message with a bytes size above the limit', () => {
      const warnSpy = spyOn(display, 'warn')
      batch.add(BIG_MESSAGE_OVER_BYTES_LIMIT)

      expect(warnSpy).toHaveBeenCalled()
      expect(flushController.notifyBeforeAddMessage).not.toHaveBeenCalled()
    })

    it('should adjust the message size after the message has been added', () => {
      const message = { message: '😤' } // JS string length = 2, but 4 bytes once encoded to UTF-8
      batch.add(message)
      expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledOnceWith(16)
      expect(flushController.notifyAfterAddMessage).toHaveBeenCalledOnceWith(2) // 2 more bytes once encoded
    })
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
      encoding: undefined,
    })

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')
    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"5"}\n{"message":"6"}\n{"message":"7"}',
      bytesCount: jasmine.any(Number),
      encoding: undefined,
    })

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    flushController.notifyFlush()

    expect(transport.send.calls.mostRecent().args[0]).toEqual({
      data: '{"message":"10"}\n{"message":"11"}',
      bytesCount: jasmine.any(Number),
      encoding: undefined,
    })
  })

  describe('flush messages when the page is not exiting or with a synchronous encoder', () => {
    it('should send addend and upserted messages in the same request', () => {
      batch.add({ message: '1' })
      batch.upsert({ message: '2' }, 'a')

      flushController.notifyFlush()

      expect(transport.send.calls.mostRecent().args[0]).toEqual({
        data: '{"message":"1"}\n{"message":"2"}',
        bytesCount: jasmine.any(Number),
        encoding: undefined,
      })
    })

    it('should encode upserted messages', () => {
      const encoderWriteSpy = spyOn(encoder, 'write')

      batch.upsert({ message: '2' }, 'a')

      flushController.notifyFlush()

      expect(encoderWriteSpy).toHaveBeenCalledOnceWith('{"message":"2"}')
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

  describe('flush messages when the page is exiting and with an asynchronous encoder', () => {
    beforeEach(() => {
      encoder.isAsync = true
    })

    //
    ;[
      {
        title: 'when adding a message, it should be sent in one request',
        add: { message: 1 },
        expectedRequests: ['{"message":1}'],
      },
      {
        title: 'when upserting a message, it should be sent in one request',
        upsert: { message: 1 },
        expectedRequests: ['{"message":1}'],
      },
      {
        title: 'when adding a message and upserting another, they should be sent in two separate requests',
        add: { message: 1 },
        upsert: { message: 2 },
        expectedRequests: ['{"message":1}', '{"message":2}'],
      },
      {
        title:
          'when adding a message and another message is still pending, they should be sent in two separate requests',
        add: { message: 1 },
        pending: { message: 2 },
        expectedRequests: ['{"message":1}', '{"message":2}'],
      },
      {
        title: 'when upserting a message and another message is still pending, they should be sent in one request',
        upsert: { message: 1 },
        pending: { message: 2 },
        expectedRequests: ['{"message":2}\n{"message":1}'],
      },
    ].forEach(({ title, add, upsert, pending, expectedRequests }) => {
      it(title, () => {
        if (add) {
          batch.add(add)
        }
        if (upsert) {
          batch.upsert(upsert, 'a')
        }
        if (pending) {
          // eslint-disable-next-line @typescript-eslint/unbound-method
          const original = encoder.finishSync
          spyOn(encoder, 'finishSync').and.callFake(() => ({
            ...original(),
            pendingData: JSON.stringify(pending),
          }))
        }

        flushController.notifyFlush('before_unload')

        expect(transport.sendOnExit.calls.allArgs().map(([payload]) => payload.data)).toEqual(expectedRequests)
      })
    })

    it('should be able to use telemetry in the httpRequest.sendOnExit', () => {
      transport.sendOnExit.and.callFake(() => {
        addTelemetryDebugFake()
      })
      const addTelemetryDebugFake = () => batch.add({ message: 'telemetry message' })

      batch.add({ message: 'normal message' })
      batch.upsert({ message: '2' }, 'a')
      expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledTimes(2)

      flushController.notifyFlush('before_unload')
      expect(transport.sendOnExit).toHaveBeenCalledTimes(2)
      expect(flushController.notifyBeforeAddMessage).toHaveBeenCalledTimes(4)

      flushController.notifyFlush('before_unload')
      expect(transport.sendOnExit).toHaveBeenCalledTimes(3)
    })
  })
})
