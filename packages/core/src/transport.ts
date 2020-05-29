import { monitor } from './internalMonitoring'
import { Context, deepMerge, DOM_EVENT, jsonStringify, noop, objectValues } from './utils'

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
    const url = this.withBatchTime ? addBatchTime(this.endpointUrl) : this.endpointUrl
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

function addBatchTime(url: string) {
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}batch_time=${new Date().getTime()}`
}

export interface ProcessedMessage<T> {
  message: T
  key?: string
  processedMessage: string
}

export class Batch<T> {
  private pushOnlyBuffer: string[] = []
  private upsertBuffer: { [key: string]: string } = {}
  private bufferBytesSize = 0
  private bufferMessageCount = 0
  private processedMessageBatched: Array<ProcessedMessage<T>> = []
  private concatenatedMessagesBatchStringified: string = ''

  constructor(
    private request: HttpRequest,
    private maxSize: number,
    private bytesLimit: number,
    private maxMessageSize: number,
    private flushTimeout: number,
    private contextProvider: () => Context,
    private beforeUnloadCallback: () => void = noop
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

  private debouncedAddOrUpdate(
    message: T,
    completionCallback: (
      batch: Batch<T>,
      processedMessages: Array<ProcessedMessage<T>>,
      messagesBytesSize: number
    ) => void,
    key?: string
  ) {
    const contextualizedMessage = deepMerge({}, this.contextProvider(), (message as unknown) as Context) as Context
    const processedMessage = jsonStringify(contextualizedMessage)!
    this.processedMessageBatched.push({ message, key, processedMessage })
    this.concatenatedMessagesBatchStringified += processedMessage

    setTimeout(() => {
      if (this.processedMessageBatched.length) {
        const processedMessages: Array<ProcessedMessage<T>> = [...this.processedMessageBatched]
        const messageBytesSize = this.sizeInBytes(this.concatenatedMessagesBatchStringified)
        completionCallback(this, processedMessages, messageBytesSize)

        this.processedMessageBatched = []
        this.concatenatedMessagesBatchStringified = ''
      }
    }, 1000)
  }

  private addOrUpdate(message: T, key?: string) {
    function handleResult(batch: Batch<T>, processedMessages: Array<ProcessedMessage<T>>, messagesBytesSize: number) {
      if (messagesBytesSize >= batch.maxMessageSize * processedMessages.length) {
        console.warn(
          `Discarded a message whose size was bigger than the maximum allowed size ${batch.maxMessageSize}KB.`
        )
        return
      }

      processedMessages.forEach((processedMessage: ProcessedMessage<T>) => {
        if (batch.hasMessageFor(processedMessage.key)) {
          batch.remove(processedMessage.key)
        }
      })

      if (batch.willReachedBytesLimitWith(messagesBytesSize)) {
        batch.flush()
      }

      batch.addBytesSize(messagesBytesSize)

      processedMessages.forEach((processedMessage: ProcessedMessage<T>) => {
        batch.push(processedMessage.processedMessage, processedMessage.key)
      })

      if (batch.isFull()) {
        batch.flush()
      }
    }

    this.debouncedAddOrUpdate(message, handleResult)
  }

  private push(processedMessage: string, key?: string) {
    if (this.bufferMessageCount > 0) {
      // \n separator at serialization
      this.bufferBytesSize += 1
    }
    if (key !== undefined) {
      this.upsertBuffer[key] = processedMessage
    } else {
      this.pushOnlyBuffer.push(processedMessage)
    }
    this.bufferMessageCount += 1
  }

  private addBytesSize(messagesBytesSize: number) {
    this.bufferBytesSize += messagesBytesSize
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
    return new TextEncoder().encode(candidate).length
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
    // @ts-ignore this function is not always defined
    if (navigator.sendBeacon) {
      /**
       * beforeunload is called before visibilitychange
       * register first to be sure to be called before flush on beforeunload
       * caveat: unload can still be canceled by another listener
       */
      window.addEventListener(DOM_EVENT.BEFORE_UNLOAD, monitor(this.beforeUnloadCallback))

      /**
       * Only event that guarantee to fire on mobile devices when the page transitions to background state
       * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
       */
      document.addEventListener(
        DOM_EVENT.VISIBILITY_CHANGE,
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
      window.addEventListener(DOM_EVENT.BEFORE_UNLOAD, monitor(() => this.flush()))
    }
  }
}
