import { display } from '../tools/display'
import type { Context } from '../tools/context'
import { jsonStringify, objectValues } from '../tools/utils'
import { monitor } from '../tools/monitor'
import type { PageExitState } from '../tools/pageExitState'
import type { HttpRequest } from './httpRequest'

// https://en.wikipedia.org/wiki/UTF-8
// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

export class Batch {
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
    pageExitState: PageExitState
  ) {
    pageExitState.onPageExit(() => this.flush(this.request.sendOnExit))
    this.flushPeriodically()
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
    this.addOrUpdate(message, key)
  }

  flush(sendFn = this.request.send) {
    if (this.bufferMessagesCount !== 0) {
      const messages = this.pushOnlyBuffer.concat(objectValues(this.upsertBuffer))
      const bytesCount = this.bufferBytesCount

      this.pushOnlyBuffer = []
      this.upsertBuffer = {}
      this.bufferBytesCount = 0
      this.bufferMessagesCount = 0

      sendFn({ data: messages.join('\n'), bytesCount })
    }
  }

  computeBytesCount(candidate: string) {
    // Accurate bytes count computations can degrade performances when there is a lot of events to process
    if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
      return candidate.length
    }

    if (window.TextEncoder !== undefined) {
      return new TextEncoder().encode(candidate).length
    }

    return new Blob([candidate]).size
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
      this.flush()
    }

    this.push(processedMessage, messageBytesCount, key)
    if (this.isFull()) {
      this.flush()
    }
  }

  private process(message: Context) {
    const processedMessage = jsonStringify(message)!
    const messageBytesCount = this.computeBytesCount(processedMessage)
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
    const messageBytesCount = this.computeBytesCount(removedMessage)
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
        this.flush()
        this.flushPeriodically()
      }),
      this.flushTimeout
    )
  }
}
