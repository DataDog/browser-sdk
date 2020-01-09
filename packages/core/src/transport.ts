import lodashMerge from 'lodash.merge'

import { monitor } from './internalMonitoring'
import { Context, jsonStringify } from './utils'

/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpRequest {
  constructor(private endpointUrl: string, private bytesLimit: number) {}

  send(data: string, size: number) {
    if (navigator.sendBeacon && size < this.bytesLimit) {
      const isQueued = navigator.sendBeacon(this.endpointUrl, data)
      if (isQueued) {
        return
      }
    }
    const request = new XMLHttpRequest()
    request.open('POST', this.endpointUrl, true)
    request.send(data)
  }
}

export class Batch<T> {
  private beforeFlushOnUnloadHandlers: Array<() => void> = []
  private buffer: string[] = []
  private bufferBytesSize = 0
  private bufferIndexByKey: { [key: string]: number } = {}

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

  remove(index: number) {
    const [removedMessage] = this.buffer.splice(index, 1)
    const messageBytesSize = this.sizeInBytes(removedMessage)
    this.bufferBytesSize -= messageBytesSize
    if (this.buffer.length > 0) {
      this.bufferBytesSize -= 1
    }
  }

  beforeFlushOnUnload(handler: () => void) {
    this.beforeFlushOnUnloadHandlers.push(handler)
  }

  flush() {
    if (this.buffer.length !== 0) {
      this.request.send(this.buffer.join('\n'), this.bufferBytesSize)
      this.buffer = []
      this.bufferBytesSize = 0
      this.bufferIndexByKey = {}
    }
  }

  private addOrUpdate(message: T, key?: string) {
    const { processedMessage, messageBytesSize } = this.process(message)
    if (messageBytesSize >= this.maxMessageSize) {
      console.warn(`Discarded a message whose size was bigger than the maximum allowed size ${this.maxMessageSize}KB.`)
      return
    }
    if (key && this.bufferIndexByKey[key] !== undefined) {
      this.remove(this.bufferIndexByKey[key])
    }
    if (this.willReachedBytesLimitWith(messageBytesSize)) {
      this.flush()
    }
    this.push(processedMessage, messageBytesSize)
    if (key) {
      this.bufferIndexByKey[key] = this.buffer.length - 1
    }
    if (this.isFull()) {
      this.flush()
    }
  }

  private flushPeriodically() {
    setTimeout(() => {
      this.flush()
      this.flushPeriodically()
    }, this.flushTimeout)
  }

  private process(message: T) {
    const contextualizedMessage = lodashMerge({}, this.contextProvider(), message) as Context
    const processedMessage = jsonStringify(contextualizedMessage)!
    const messageBytesSize = this.sizeInBytes(processedMessage)
    return { processedMessage, messageBytesSize }
  }

  private push(processedMessage: string, messageBytesSize: number) {
    if (this.buffer.length > 0) {
      // \n separator at serialization
      this.bufferBytesSize += 1
    }
    this.buffer.push(processedMessage)
    this.bufferBytesSize += messageBytesSize
  }

  private willReachedBytesLimitWith(messageBytesSize: number) {
    // byte of the separator at the end of the message
    return this.bufferBytesSize + messageBytesSize + 1 >= this.bytesLimit
  }

  private isFull() {
    return this.buffer.length === this.maxSize || this.bufferBytesSize >= this.bytesLimit
  }

  private sizeInBytes(candidate: string) {
    // tslint:disable-next-line no-bitwise
    return ~-encodeURI(candidate).split(/%..|./).length
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
