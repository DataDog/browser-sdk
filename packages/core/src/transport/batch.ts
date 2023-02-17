import { display } from '../tools/display'
import type { Context } from '../tools/context'
import { computeBytesCount, jsonStringify, objectValues } from '../tools/utils'
import { monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { PageExitEvent } from '../browser/pageExitObservable'
import type { HttpRequest } from './httpRequest'

export interface BatchFlushEvent {
  bufferBytesCount: number
  bufferMessagesCount: number
}

export type FlushReason =
  | 'batch_duration_limit'
  | 'batch_bytes_limit'
  | 'before_unload'
  | 'pagehide'
  | 'visibility_hidden'
  | 'page_frozen'

export class Batch {
  flushObservable = new Observable<BatchFlushEvent>()

  private pushOnlyBuffer: string[] = []
  private upsertBuffer: { [key: string]: string } = {}
  private bufferBytesCount = 0
  private bufferMessagesCount = 0

  constructor(
    private request: HttpRequest,
    private batchMessagesLimit: number,
    private batchBytesLimit: number,
    private messageBytesLimit: number,
    private flushTimeout: number,
    private pageExitObservable: Observable<PageExitEvent>
  ) {
    pageExitObservable.subscribe((event) => this.flush(event.reason, this.request.sendOnExit))
    this.flushPeriodically()
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
    this.addOrUpdate(message, key)
  }

  flush(flushReason: FlushReason, sendFn = this.request.send) {
    if (this.bufferMessagesCount !== 0) {
      const messages = this.pushOnlyBuffer.concat(objectValues(this.upsertBuffer))
      const bytesCount = this.bufferBytesCount

      this.flushObservable.notify({
        bufferBytesCount: this.bufferBytesCount,
        bufferMessagesCount: this.bufferMessagesCount,
      })

      this.pushOnlyBuffer = []
      this.upsertBuffer = {}
      this.bufferBytesCount = 0
      this.bufferMessagesCount = 0

      sendFn({ data: messages.join('\n'), bytesCount, flushReason })
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
    if (this.willReachedBytesLimitWith(messageBytesCount)) {
      this.flush('batch_bytes_limit')
    }

    this.push(processedMessage, messageBytesCount, key)
    if (this.isFull()) {
      this.flush('batch_bytes_limit')
    }
  }

  private process(message: Context) {
    const processedMessage = jsonStringify(message)!
    const messageBytesCount = computeBytesCount(processedMessage)
    return { processedMessage, messageBytesCount }
  }

  private push(processedMessage: string, messageBytesCount: number, key?: string) {
    if (this.bufferMessagesCount > 0) {
      // \n separator at serialization
      this.bufferBytesCount += 1
    }
    if (key !== undefined) {
      this.upsertBuffer[key] = processedMessage
    } else {
      this.pushOnlyBuffer.push(processedMessage)
    }
    this.bufferBytesCount += messageBytesCount
    this.bufferMessagesCount += 1
  }

  private remove(key: string) {
    const removedMessage = this.upsertBuffer[key]
    delete this.upsertBuffer[key]
    const messageBytesCount = computeBytesCount(removedMessage)
    this.bufferBytesCount -= messageBytesCount
    this.bufferMessagesCount -= 1
    if (this.bufferMessagesCount > 0) {
      this.bufferBytesCount -= 1
    }
  }

  private hasMessageFor(key?: string): key is string {
    return key !== undefined && this.upsertBuffer[key] !== undefined
  }

  private willReachedBytesLimitWith(messageBytesCount: number) {
    // byte of the separator at the end of the message
    return this.bufferBytesCount + messageBytesCount + 1 >= this.batchBytesLimit
  }

  private isFull() {
    return this.bufferMessagesCount === this.batchMessagesLimit || this.bufferBytesCount >= this.batchBytesLimit
  }

  private flushPeriodically() {
    setTimeout(
      monitor(() => {
        this.flush('batch_duration_limit')
        this.flushPeriodically()
      }),
      this.flushTimeout
    )
  }
}
