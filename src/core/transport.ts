import lodashMerge from 'lodash.merge'

import { Context } from './context'
import { monitor } from './internalMonitoring'
import { jsonStringify } from './utils'

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

export class MultiHttpRequest {
  private requests: HttpRequest[] = []

  constructor(private endpointUrls: string[], private bytesLimit: number) {
    this.endpointUrls.forEach((endpointUrl) => {
      if (endpointUrl) {
        this.requests.push(new HttpRequest(endpointUrl, this.bytesLimit))
      }
    })
  }

  send(data: string, size: number) {
    this.requests.forEach((request) => request.send(data, size))
  }
}

export class Batch<T> {
  private beforeFlushOnUnloadHandlers: Array<() => void> = []
  private buffer: string = ''
  private bufferBytesSize = 0
  private bufferMessageCount = 0

  constructor(
    private request: HttpRequest | MultiHttpRequest,
    private maxSize: number,
    private bytesLimit: number,
    private maxMessageSize: number,
    private flushTimeout: number,
    private contextProvider: () => Context,
    private messageProcessor?: (message: T) => object
  ) {
    this.flushOnVisibilityHidden()
    this.flushPeriodically()
  }

  add(message: T) {
    const { processedMessage, messageBytesSize } = this.process(message)
    if (messageBytesSize >= this.maxMessageSize) {
      console.warn(`Discarded a message whose size was bigger than the maximum allowed size ${this.maxMessageSize}KB.`)
      return
    }
    if (this.willReachedBytesLimitWith(messageBytesSize)) {
      this.flush()
    }
    this.push(processedMessage, messageBytesSize)
    if (this.isFull()) {
      this.flush()
    }
  }

  beforeFlushOnUnload(handler: () => void) {
    this.beforeFlushOnUnloadHandlers.push(handler)
  }

  flush() {
    if (this.buffer.length !== 0) {
      this.request.send(this.buffer, this.bufferBytesSize)
      this.buffer = ''
      this.bufferBytesSize = 0
      this.bufferMessageCount = 0
    }
  }

  private flushPeriodically() {
    setTimeout(() => {
      this.flush()
      this.flushPeriodically()
    }, this.flushTimeout)
  }

  private process(message: T) {
    let contextualizedMessage = lodashMerge({}, this.contextProvider(), message)
    if (this.messageProcessor) {
      contextualizedMessage = this.messageProcessor(contextualizedMessage)
    }
    const processedMessage = jsonStringify(contextualizedMessage)
    const messageBytesSize = this.sizeInBytes(processedMessage)
    return { processedMessage, messageBytesSize }
  }

  private push(processedMessage: string, messageBytesSize: number) {
    if (this.buffer) {
      this.buffer += '\n'
      this.bufferBytesSize += 1
    }
    this.buffer += processedMessage
    this.bufferBytesSize += messageBytesSize
    this.bufferMessageCount += 1
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
