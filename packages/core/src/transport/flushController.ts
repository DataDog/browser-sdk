import type { PageExitEvent, PageExitReason } from '../browser/pageExitObservable'
import { Observable } from '../tools/observable'
import type { TimeoutId } from '../tools/timer'
import { clearTimeout, setTimeout } from '../tools/timer'
import type { Duration } from '../tools/utils/timeUtils'

export type FlushReason = PageExitReason | 'duration_limit' | 'bytes_limit' | 'messages_limit' | 'session_expire'

export type FlushController = ReturnType<typeof createFlushController>
export interface FlushEvent {
  reason: FlushReason
  bytesCount: number
  messagesCount: number
}

interface FlushControllerOptions {
  messagesLimit: number
  bytesLimit: number
  durationLimit: Duration
  pageExitObservable: Observable<PageExitEvent>
  sessionExpireObservable: Observable<void>
}

export function createFlushController({
  messagesLimit,
  bytesLimit,
  durationLimit,
  pageExitObservable,
  sessionExpireObservable,
}: FlushControllerOptions) {
  const flushObservable = new Observable<FlushEvent>()

  pageExitObservable.subscribe((event) => flush(event.reason))
  sessionExpireObservable.subscribe(() => flush('session_expire'))

  let currentBytesCount = 0
  let currentMessagesCount = 0

  function flush(flushReason: FlushReason) {
    if (currentMessagesCount === 0) {
      return
    }

    const messagesCount = currentMessagesCount
    const bytesCount = currentBytesCount

    currentMessagesCount = 0
    currentBytesCount = 0
    cancelDurationLimitTimeout()

    flushObservable.notify({
      reason: flushReason,
      messagesCount,
      bytesCount,
    })
  }

  let durationLimitTimeoutId: TimeoutId | undefined
  function scheduleDurationLimitTimeout() {
    if (durationLimitTimeoutId === undefined) {
      durationLimitTimeoutId = setTimeout(() => {
        flush('duration_limit')
      }, durationLimit)
    }
  }

  function cancelDurationLimitTimeout() {
    clearTimeout(durationLimitTimeoutId)
    durationLimitTimeoutId = undefined
  }

  return {
    flushObservable,
    get messagesCount() {
      return currentMessagesCount
    },

    notifyBeforeAddMessage(messageBytesCount: number) {
      if (currentBytesCount + messageBytesCount >= bytesLimit) {
        flush('bytes_limit')
      }
      // Consider the message to be added now rather than in `notifyAfterAddMessage`, because if no message
      // was added yet and `notifyAfterAddMessage` is called asynchronously, we still want to notify when a
      // flush is needed (for example on page exit).
      currentMessagesCount += 1
      currentBytesCount += messageBytesCount
      scheduleDurationLimitTimeout()
    },

    notifyAfterAddMessage() {
      if (currentMessagesCount >= messagesLimit) {
        flush('messages_limit')
      } else if (currentBytesCount >= bytesLimit) {
        flush('bytes_limit')
      }
    },

    notifyAfterRemoveMessage(messageBytesCount: number) {
      currentBytesCount -= messageBytesCount
      currentMessagesCount -= 1
      if (currentMessagesCount === 0) {
        cancelDurationLimitTimeout()
      }
    },
  }
}
