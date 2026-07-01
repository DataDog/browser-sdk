import type { Clock } from '../../test/mockClock'
import { mockClock } from '../../test/mockClock'
import { Observable } from '../util/observable'
import { RECOMMENDED_REQUEST_BYTES_LIMIT } from './payload'
import type { PageMayExitEvent, FlushEvent } from './flushController'
import { createFlushController, FLUSH_DURATION_LIMIT, MESSAGES_LIMIT } from './flushController'

type FlushController = ReturnType<typeof createFlushController>

const BYTES_LIMIT = RECOMMENDED_REQUEST_BYTES_LIMIT
// Arbitrary message size that is below the BYTES_LIMIT
const SMALL_MESSAGE_BYTE_COUNT = 2

describe('flushController', () => {
  let clock: Clock
  let flushController: FlushController
  let flushSpy: jasmine.Spy<(event: FlushEvent) => void>
  let pageMayExitObservable: Observable<PageMayExitEvent>

  beforeEach(() => {
    clock = mockClock()
    pageMayExitObservable = new Observable()
    flushController = createFlushController({
      pageMayExitObservable,
    })
    flushSpy = jasmine.createSpy()
    flushController.flushObservable.subscribe(flushSpy)
  })

  it('when flushing, the event contains a reason, the bytes count and the messages count', () => {
    const messagesCount = 3
    for (let i = 0; i < messagesCount; i += 1) {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
    }

    pageMayExitObservable.notify({ reason: 'before_unload' })

    expect(flushSpy).toHaveBeenCalledOnceWith({
      reason: jasmine.any(String),
      bytesCount: messagesCount * SMALL_MESSAGE_BYTE_COUNT,
      messagesCount,
    })
  })

  describe('page exit', () => {
    it('notifies when the page is exiting', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      pageMayExitObservable.notify({ reason: 'before_unload' })
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be the page exit reason', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      pageMayExitObservable.notify({ reason: 'before_unload' })
      expect(flushSpy.calls.first().args[0].reason).toBe('before_unload')
    })

    it('does not notify if no message was added', () => {
      pageMayExitObservable.notify({ reason: 'before_unload' })
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('notifies when the page is exiting even if no message have been fully added yet', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      pageMayExitObservable.notify({ reason: 'before_unload' })
      expect(flushSpy).toHaveBeenCalled()
    })
  })

  describe('forceFlush', () => {
    it('notifies when forceFlush is called', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.forceFlush('session_expire')
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be the provided reason', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.forceFlush('session_expire')
      expect(flushSpy.calls.first().args[0].reason).toBe('session_expire')
    })

    it('does not notify if no message was added', () => {
      flushController.forceFlush('session_expire')
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('notifies even if no message have been fully added yet', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.forceFlush('session_expire')
      expect(flushSpy).toHaveBeenCalled()
    })
  })

  describe('bytes limit', () => {
    it('uses the urgent reason as flush reason for intermediate flushes during page exit', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()

      flushController.prepareUrgentFlushObservable.subscribe(() => {
        flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      })

      pageMayExitObservable.notify({ reason: 'before_unload' })

      expect(flushSpy.calls.first().args[0].reason).toBe('before_unload')
    })

    it('notifies when the bytes limit is reached after adding a message', () => {
      flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      flushController.notifyAfterAddMessage()
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be "bytes_limit"', () => {
      flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      flushController.notifyAfterAddMessage()
      expect(flushSpy.calls.first().args[0].reason).toBe('bytes_limit')
    })

    it('notifies when the bytes limit will be reached before adding a message', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('triggers bytes_limit when replacing a message increases the total above the limit', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()

      flushController.notifyAfterAddMessage(BYTES_LIMIT - SMALL_MESSAGE_BYTE_COUNT)

      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not notify when the bytes limit will be reached if no message was added yet', () => {
      flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('resets the current bytes count once flushed', () => {
      flushController.notifyBeforeAddMessage(BYTES_LIMIT)
      flushController.notifyAfterAddMessage()

      flushSpy.calls.reset()

      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      expect(flushSpy).not.toHaveBeenCalled()
    })
  })

  describe('messages limit', () => {
    it('notifies when the messages limit is reached', () => {
      for (let i = 0; i < MESSAGES_LIMIT; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be "messages_limit"', () => {
      for (let i = 0; i < MESSAGES_LIMIT; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }
      expect(flushSpy.calls.first().args[0].reason).toBe('messages_limit')
    })

    it('does not flush when the message was not fully added yet', () => {
      for (let i = 0; i < MESSAGES_LIMIT - 1; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('does not change the messages count when replacing a message', () => {
      for (let i = 0; i < MESSAGES_LIMIT - 1; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }

      flushController.notifyAfterAddMessage(0)

      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('resets the messages count when flushed', () => {
      for (let i = 0; i < MESSAGES_LIMIT; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }

      flushSpy.calls.reset()

      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      expect(flushSpy).not.toHaveBeenCalled()
    })
  })

  describe('duration limit', () => {
    it('notifies when the duration limit is reached after adding a message', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(FLUSH_DURATION_LIMIT)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be "duration_limit"', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(FLUSH_DURATION_LIMIT)
      expect(flushSpy.calls.first().args[0].reason).toBe('duration_limit')
    })

    it('does not postpone the duration limit when another message was added', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(FLUSH_DURATION_LIMIT / 2)
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(FLUSH_DURATION_LIMIT / 2)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not notify if no message was added yet', () => {
      clock.tick(FLUSH_DURATION_LIMIT)
      expect(flushSpy).not.toHaveBeenCalled()
    })
  })
})
