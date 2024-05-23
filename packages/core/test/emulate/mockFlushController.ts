import { Observable } from '../../src/tools/observable'
import type { FlushEvent, FlushController, FlushReason } from '../../src/transport'

export type MockFlushController = ReturnType<typeof createMockFlushController>

export function createMockFlushController() {
  const flushObservable = new Observable<FlushEvent>()
  let currentMessagesCount = 0
  let currentBytesCount = 0

  return {
    flushObservable,
    get messagesCount() {
      return currentMessagesCount
    },
    notifyBeforeAddMessage: jasmine
      .createSpy<FlushController['notifyBeforeAddMessage']>()
      .and.callFake((messageBytesCount) => {
        currentBytesCount += messageBytesCount
        currentMessagesCount += 1
      }),
    notifyAfterAddMessage: jasmine
      .createSpy<FlushController['notifyAfterAddMessage']>()
      .and.callFake((messageBytesCountDiff = 0) => {
        currentBytesCount += messageBytesCountDiff
      }),
    notifyAfterRemoveMessage: jasmine
      .createSpy<FlushController['notifyAfterRemoveMessage']>()
      .and.callFake((messageBytesCount) => {
        currentBytesCount -= messageBytesCount
        currentMessagesCount -= 1
      }),
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
  } satisfies Record<any, any> & FlushController
}
