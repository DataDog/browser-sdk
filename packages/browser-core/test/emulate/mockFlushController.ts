import { vi } from 'vitest'
import { Observable } from '../../src/tools/observable'
import type { FlushEvent, FlushController, FlushReason, UrgentFlushReason } from '../../src/transport'

export type MockFlushController = ReturnType<typeof createMockFlushController>

export function createMockFlushController() {
  const flushObservable = new Observable<FlushEvent>()
  const prepareUrgentFlushObservable = new Observable<UrgentFlushReason>()
  let currentMessagesCount = 0
  let currentBytesCount = 0

  const flushController = {
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
    flushObservable,
    prepareUrgentFlushObservable,
    forceFlush: vi.fn<FlushController['forceFlush']>(),
    get messagesCount() {
      return currentMessagesCount
    },
  } satisfies FlushController

  return {
    ...flushController,
    get messagesCount() {
      return currentMessagesCount
    },
    get bytesCount() {
      return currentBytesCount
    },
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
  }
}
