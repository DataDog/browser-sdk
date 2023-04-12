import { Observable } from '../../src/tools/observable'
import type { FlushEvent, FlushController } from '../../src/transport'

export type MockFlushController = ReturnType<typeof createMockFlushController>

export function createMockFlushController() {
  const flushObservable = new Observable<FlushEvent>()
  let currentMessagesCount = 0
  let currentBytesCount = 0

  return {
    notifyBeforeAddMessage: jasmine
      .createSpy<FlushController['notifyBeforeAddMessage']>()
      .and.callFake((messageBytesCount) => {
        currentBytesCount += messageBytesCount
        currentMessagesCount += 1
      }),
    notifyAfterAddMessage: jasmine.createSpy<FlushController['notifyAfterAddMessage']>(),
    notifyAfterRemoveMessage: jasmine
      .createSpy<FlushController['notifyAfterRemoveMessage']>()
      .and.callFake((messageBytesCount) => {
        currentBytesCount -= messageBytesCount
        currentMessagesCount -= 1
      }),
    get messagesCount() {
      return currentMessagesCount
    },
    flushObservable,
    notifyFlush() {
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
        reason: 'bytes_limit',
        bytesCount,
        messagesCount,
      })
    },
  } satisfies Record<any, any> & FlushController
}
