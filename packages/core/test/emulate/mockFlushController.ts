import { vi } from 'vitest'
import { Observable } from '../../src/tools/observable'
import type { FlushEvent, FlushController, FlushReason } from '../../src/transport'

export type MockFlushController = ReturnType<typeof createMockFlushController>

export function createMockFlushController() {
  const flushObservable = new Observable<FlushEvent>()
  let currentMessagesCount = 0
  let currentBytesCount = 0

  return {
    notifyBeforeAddMessage: vi
      .fn<FlushController['notifyBeforeAddMessage']>()
      .mockImplementation((messageBytesCount) => {
        currentBytesCount += messageBytesCount
        currentMessagesCount += 1
      }),
    notifyAfterAddMessage: vi
      .fn<FlushController['notifyAfterAddMessage']>()
      .mockImplementation((messageBytesCountDiff = 0) => {
        currentBytesCount += messageBytesCountDiff
      }),
    notifyAfterRemoveMessage: vi
      .fn<FlushController['notifyAfterRemoveMessage']>()
      .mockImplementation((messageBytesCount) => {
        currentBytesCount -= messageBytesCount
        currentMessagesCount -= 1
      }),
    get messagesCount() {
      return currentMessagesCount
    },
    get bytesCount() {
      return currentBytesCount
    },
    flushObservable,
    notifyFlush(reason: FlushReason = 'bytes_limit') {
      if (currentMessagesCount === 0) {
        throw new Error(
          'MockFlushController.notifyFlush(): the original FlushController would not notify flush if no message was added'
        )
      }

      const messagesCount = currentMessagesCount
      const bytesCount = currentBytesCount

      currentMessagesCount = 0
      currentBytesCount = 0

      flushObservable.notify({
        reason,
        bytesCount,
        messagesCount,
      })
    },
  } satisfies Record<any, any> & FlushController
}
