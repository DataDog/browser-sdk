import type { Clock } from '../../test'
import { mockClock } from '../../test'
import type { PageMayExitEvent } from '../browser/pageMayExitObservable'
import { Observable } from '../tools/observable'
import type { Duration } from '../tools/utils/timeUtils'
import type { FlushController, FlushEvent } from './flushController'
import { createFlushController } from './flushController'

const BYTES_LIMIT = 100
const MESSAGES_LIMIT = 5
const DURATION_LIMIT = 100 as Duration
// Arbitrary message size that is below the BYTES_LIMIT
const SMALL_MESSAGE_BYTE_COUNT = 2

describe('flushController', () => {
  let clock: Clock
  let flushController: FlushController
  let flushSpy: jasmine.Spy<(event: FlushEvent) => void>
  let pageMayExitObservable: Observable<PageMayExitEvent>
  let sessionExpireObservable: Observable<void>

  beforeEach(() => {
    clock = mockClock()
    pageMayExitObservable = new Observable()
    sessionExpireObservable = new Observable()
    flushController = createFlushController({
      bytesLimit: BYTES_LIMIT,
      messagesLimit: MESSAGES_LIMIT,
      durationLimit: DURATION_LIMIT,
      pageMayExitObservable,
      sessionExpireObservable,
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

  describe('session expire', () => {
    it('notifies when the session expires', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      sessionExpireObservable.notify()
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be "session_expire"', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      sessionExpireObservable.notify()
      expect(flushSpy.calls.first().args[0].reason).toBe('session_expire')
    })

    it('does not notify if no message was added', () => {
      sessionExpireObservable.notify()
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('notifies when the session expires even if no message have been fully added yet', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      sessionExpireObservable.notify()
      expect(flushSpy).toHaveBeenCalled()
    })
  })

  describe('bytes limit', () => {
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

    it('does not take removed messages into account', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.notifyAfterRemoveMessage(SMALL_MESSAGE_BYTE_COUNT)

      flushController.notifyBeforeAddMessage(BYTES_LIMIT - SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()

      expect(flushSpy).not.toHaveBeenCalled()
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

    it('does not take removed messages into account', () => {
      for (let i = 0; i < MESSAGES_LIMIT - 1; i += 1) {
        flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
        flushController.notifyAfterAddMessage()
      }

      flushController.notifyAfterRemoveMessage(SMALL_MESSAGE_BYTE_COUNT)

      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()

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
      clock.tick(DURATION_LIMIT)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('flush reason should be "duration_limit"', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(DURATION_LIMIT)
      expect(flushSpy.calls.first().args[0].reason).toBe('duration_limit')
    })

    it('does not postpone the duration limit when another message was added', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(DURATION_LIMIT / 2)
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(DURATION_LIMIT / 2)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not notify if no message was added yet', () => {
      clock.tick(DURATION_LIMIT)
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('does not notify if a message was added then removed', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.notifyAfterRemoveMessage(SMALL_MESSAGE_BYTE_COUNT)
      clock.tick(DURATION_LIMIT)
      expect(flushSpy).not.toHaveBeenCalled()
    })

    it('notifies if a message was added, and another was added then removed', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()

      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.notifyAfterRemoveMessage(SMALL_MESSAGE_BYTE_COUNT)

      clock.tick(DURATION_LIMIT)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not notify prematurely if a message was added then removed then another was added', () => {
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      flushController.notifyAfterRemoveMessage(SMALL_MESSAGE_BYTE_COUNT)
      clock.tick(DURATION_LIMIT / 2)
      flushController.notifyBeforeAddMessage(SMALL_MESSAGE_BYTE_COUNT)
      flushController.notifyAfterAddMessage()
      clock.tick(DURATION_LIMIT / 2)
      expect(flushSpy).not.toHaveBeenCalled()
      clock.tick(DURATION_LIMIT / 2)
      expect(flushSpy).toHaveBeenCalled()
    })
  })
})
