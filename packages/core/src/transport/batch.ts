import { display } from '../tools/display'
import type { Context } from '../tools/serialisation/context'
import { objectValues } from '../tools/utils/polyfills'
import { isPageExitReason } from '../browser/pageExitObservable'
import { computeBytesCount } from '../tools/utils/byteUtils'
import { jsonStringify } from '../tools/serialisation/jsonStringify'
import type { HttpRequest } from './httpRequest'
import type { FlushController, FlushEvent } from './flushController'

export class Batch {
  private pushOnlyBuffer: string[] = []
  private upsertBuffer: { [key: string]: string } = {}

  constructor(
    private request: HttpRequest,
    public flushController: FlushController,
    private messageBytesLimit: number
  ) {
    this.flushController.flushObservable.subscribe((event) => this.flush(event))
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
    this.addOrUpdate(message, key)
  }

  private flush(event: FlushEvent) {
    const messages = this.pushOnlyBuffer.concat(objectValues(this.upsertBuffer))

    this.pushOnlyBuffer = []
    this.upsertBuffer = {}

    const payload = { data: messages.join('\n'), bytesCount: event.bytesCount, flushReason: event.reason }
    if (isPageExitReason(event.reason)) {
      this.request.sendOnExit(payload)
    } else {
      this.request.send(payload)
    }
  }

  private addOrUpdate(message: Context, key?: string) {
    const { processedMessage, messageBytesCount } = this.process(message)

    if (messageBytesCount >= this.messageBytesLimit) {
      display.warn(
        `Discarded a message whose size was bigger than the maximum allowed size ${this.messageBytesLimit}KB.`
      )
      return
    }

    if (this.hasMessageFor(key)) {
      this.remove(key)
    }

    this.push(processedMessage, messageBytesCount, key)
  }

  private process(message: Context) {
    const processedMessage = jsonStringify(message)!
    const messageBytesCount = computeBytesCount(processedMessage)
    return { processedMessage, messageBytesCount }
  }

  private push(processedMessage: string, messageBytesCount: number, key?: string) {
    // If there are other messages, a '\n' will be added at serialization
    const separatorBytesCount = this.flushController.messagesCount > 0 ? 1 : 0

    this.flushController.notifyBeforeAddMessage(messageBytesCount + separatorBytesCount)
    if (key !== undefined) {
      this.upsertBuffer[key] = processedMessage
    } else {
      this.pushOnlyBuffer.push(processedMessage)
    }
    this.flushController.notifyAfterAddMessage()
  }

  private remove(key: string) {
    const removedMessage = this.upsertBuffer[key]
    delete this.upsertBuffer[key]
    const messageBytesCount = computeBytesCount(removedMessage)
    // If there are other messages, a '\n' will be added at serialization
    const separatorBytesCount = this.flushController.messagesCount > 1 ? 1 : 0
    this.flushController.notifyAfterRemoveMessage(messageBytesCount + separatorBytesCount)
  }

  private hasMessageFor(key?: string): key is string {
    return key !== undefined && this.upsertBuffer[key] !== undefined
  }
}
