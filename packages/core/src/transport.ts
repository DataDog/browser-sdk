import lodashMerge from 'lodash.merge'

import { monitor } from './internalMonitoring'
import { Context, jsonStringify, objectValues } from './utils'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpRequest {
  constructor(private endpointUrl: string, private bytesLimit: number, private withBatchTime: boolean = false) {}

  send(data: string, size: number) {
    const batchTime = new Date().getTime()
    const url = this.withBatchTime ? `${this.endpointUrl}&batch_time=${batchTime}` : this.endpointUrl
    if (navigator.sendBeacon && size < this.bytesLimit) {
      const isQueued = navigator.sendBeacon(url, data)
      if (isQueued) {
        return
      }
    }
    const request = new XMLHttpRequest()
    request.open('POST', url, true)
    request.send(data)
  }
}

export class Batch<T> {
  private beforeFlushOnUnloadHandlers: Array<() => void> = []
  private pushOnlyBuffer: string[] = []
  private upsertBuffer: { [key: string]: string } = {}
  private bufferBytesSize = 0
  private bufferMessageCount = 0

  constructor(
    private request: HttpRequest,
    private maxSize: number,
    private bytesLimit: number,
    private maxMessageSize: number,
    private flushTimeout: number,
    private contextProvider: () => Context
  ) {
    this.flushOnVisibilityHidden()
    this.flushPeriodically()
  }

  add(message: T) {
    this.addOrUpdate(message)
  }

  upsert(message: T, key: string) {
    this.addOrUpdate(message, key)
  }

  beforeFlushOnUnload(handler: () => void) {
    this.beforeFlushOnUnloadHandlers.push(handler)
  }

  flush() {
    if (this.bufferMessageCount !== 0) {
      const messages = [...this.pushOnlyBuffer, ...objectValues(this.upsertBuffer)]
      this.request.send(messages.join('\n'), this.bufferBytesSize)
      this.pushOnlyBuffer = []
      this.upsertBuffer = {}
      this.bufferBytesSize = 0
      this.bufferMessageCount = 0
    }
  }

  private addOrUpdate(message: T, key?: string) {
    const { processedMessage, messageBytesSize } = this.process(message)
    if (messageBytesSize >= this.maxMessageSize) {
      console.warn(`Discarded a message whose size was bigger than the maximum allowed size ${this.maxMessageSize}KB.`)
      return
    }
    if (this.hasMessageFor(key)) {
      this.remove(key)
    }
    if (this.willReachedBytesLimitWith(messageBytesSize)) {
      this.flush()
    }
    this.push(processedMessage, messageBytesSize, key)
    if (this.isFull()) {
      this.flush()
    }
  }

  private process(message: T) {
    const contextualizedMessage = lodashMerge({}, this.contextProvider(), message) as Context
    const processedMessage = jsonStringify(contextualizedMessage)!
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

  private sizeInBytes(candidate: string) {
    // tslint:disable-next-line no-bitwise
    return ~-encodeURI(candidate).split(/%..|./).length
  }

  private flushPeriodically() {
    setTimeout(() => {
      this.flush()
      this.flushPeriodically()
    }, this.flushTimeout)
  }

  private flushOnVisibilityHidden() {
    /**
     * With sendBeacon, requests are guaranteed to be successfully sent during document unload
     */
    if (navigator.sendBeacon) {
      /**
       * beforeunload is called before visibilitychange
       * register first to be sure to be called before flush on beforeunload
       * caveat: unload can still be canceled by another listener
       */
      window.addEventListener(
        'beforeunload',
        monitor(() => {
          this.beforeFlushOnUnloadHandlers.forEach((handler) => handler())
        })
      )

      /**
       * Only event that guarantee to fire on mobile devices when the page transitions to background state
       * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
       */
      document.addEventListener(
        'visibilitychange',
        monitor(() => {
          if (document.visibilityState === 'hidden') {
            this.flush()
          }
        })
      )
      /**
       * Safari does not support yet to send a request during:
       * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
       * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
       */
      window.addEventListener('beforeunload', monitor(() => this.flush()))
    }
  }
}
