// https://en.wikipedia.org/wiki/UTF-8
import type { Context } from '@datadog/browser-core'
import { display, objectValues } from '@datadog/browser-core'
import type { HttpRequest } from './httpRequest'

// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

export class Batch {
  private pushOnlyBuffer: string[] = []

  private upsertBuffer: { [key: string]: string } = {}

  private bufferBytesSize = 0

  private bufferMessageCount = 0

  constructor(
    private request: HttpRequest,
    private maxSize: number,
    private bytesLimit: number,
    private maxMessageSize: number,
    private flushTimeout: number
  ) {
    this.flushPeriodically()
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
    this.addOrUpdate(message, key)
  }

  flush(reason?: string) {
    if (this.bufferMessageCount !== 0) {
      const messages = this.pushOnlyBuffer.concat(objectValues(this.upsertBuffer))
      this.request.send(messages.join('\n'), reason)
      this.pushOnlyBuffer = []
      this.upsertBuffer = {}
      this.bufferBytesSize = 0
      this.bufferMessageCount = 0
    }
  }

  sizeInBytes(candidate: string) {
    // Accurate byte size computations can degrade performances when there is a lot of events to process
    if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
      return candidate.length
    }

    if (window.TextEncoder !== undefined) {
      return new TextEncoder().encode(candidate).length
    }

    return new Blob([candidate]).size
  }

  private addOrUpdate(message: Context, key?: string) {
    const { processedMessage, messageBytesSize } = this.process(message)
    if (messageBytesSize >= this.maxMessageSize) {
      display.warn(`Discarded a message whose size was bigger than the maximum allowed size ${this.maxMessageSize}KB.`)
      return
    }
    if (this.hasMessageFor(key)) {
      this.remove(key)
    }
    if (this.willReachedBytesLimitWith(messageBytesSize)) {
      this.flush('willReachedBytesLimitWith')
    }
    this.push(processedMessage, messageBytesSize, key)
    if (this.isFull()) {
      this.flush('isFull')
    }
  }

  private process(message: Context) {
    const processedMessage = JSON.stringify(message)!
    const messageBytesSize = this.sizeInBytes(processedMessage)
    return { processedMessage, messageBytesSize }
  }

  private push(processedMessage: string, messageBytesSize: number, key?: string) {
    if (this.bufferMessageCount > 0) {
      // \n separator at serialization
      this.bufferBytesSize += 1
    }
    if (key !== undefined) {
      this.upsertBuffer[key] = processedMessage
    } else {
      this.pushOnlyBuffer.push(processedMessage)
    }
    this.bufferBytesSize += messageBytesSize
    this.bufferMessageCount += 1
  }

  private remove(key: string) {
    const removedMessage = this.upsertBuffer[key]
    delete this.upsertBuffer[key]
    const messageBytesSize = this.sizeInBytes(removedMessage)
    this.bufferBytesSize -= messageBytesSize
    this.bufferMessageCount -= 1
    if (this.bufferMessageCount > 0) {
      this.bufferBytesSize -= 1
    }
  }

  private hasMessageFor(key?: string): key is string {
    return key !== undefined && this.upsertBuffer[key] !== undefined
  }

  private willReachedBytesLimitWith(messageBytesSize: number) {
    // byte of the separator at the end of the message
    return this.bufferBytesSize + messageBytesSize + 1 >= this.bytesLimit
  }

  private isFull() {
    return this.bufferMessageCount === this.maxSize || this.bufferBytesSize >= this.bytesLimit
  }

  private flushPeriodically() {
    setTimeout(() => {
      this.flush('flushPeriodically')
      this.flushPeriodically()
    }, this.flushTimeout)
  }
}
