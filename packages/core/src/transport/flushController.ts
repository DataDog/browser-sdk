import type { PageExitEvent, PageExitReason } from '../browser/pageExitObservable'
import { Observable } from '../tools/observable'
import type { TimeoutId } from '../tools/timer'
import { clearTimeout, setTimeout } from '../tools/timer'
import type { Duration } from '../tools/utils/timeUtils'

export type FlushReason = PageExitReason | 'duration_limit' | 'bytes_limit'

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
}

export function createFlushController({
  messagesLimit,
  bytesLimit,
  durationLimit,
  pageExitObservable,
}: FlushControllerOptions) {
  const flushObservable = new Observable<FlushEvent>()

  pageExitObservable.subscribe((event) => flush(event.reason))

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
    cancelFlushTimeout()

    flushObservable.notify({
      reason: flushReason,
      messagesCount,
      bytesCount,
    })
  }

  let flushTimeoutId: TimeoutId | undefined
  function scheduleFlushTimeout() {
    if (flushTimeoutId === undefined) {
      flushTimeoutId = setTimeout(() => {
        flush('duration_limit')
      }, durationLimit)
    }
  }

  function cancelFlushTimeout() {
    clearTimeout(flushTimeoutId)
    flushTimeoutId = undefined
  }

  return {
    flushObservable,
    get messagesCount() {
      return currentMessagesCount
    },

    willAddMessage(messageBytesCount: number) {
      if (currentBytesCount + messageBytesCount >= bytesLimit) {
        flush('bytes_limit')
      }
      // Consider the message to be added now rather than in `didAddMessage`, because if no message
      // was added yet and `didAddMessage` is called asynchronously, we still want to notify when a
      // flush is needed (for example on page exit).
      currentMessagesCount += 1
      currentBytesCount += messageBytesCount
      scheduleFlushTimeout()
    },

    didAddMessage() {
      if (currentMessagesCount >= messagesLimit || currentBytesCount >= bytesLimit) {
        flush('bytes_limit')
      }
    },

    didRemoveMessage(messageBytesCount: number) {
      currentBytesCount -= messageBytesCount
      currentMessagesCount -= 1
      if (currentMessagesCount === 0) {
        cancelFlushTimeout()
      }
    },
  }
}
