import { display } from '../tools/display'
import { Context } from '../tools/context'
import { addEventListener, DOM_EVENT, jsonStringify, noop, objectValues } from '../tools/utils'
import { monitor, addErrorToMonitoringBatch, addMonitoringMessage } from '../domain/internalMonitoring'

// https://en.wikipedia.org/wiki/UTF-8
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/
let hasReportedXhrError = false

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

  send(data: string | FormData, size: number) {
    const url = this.withBatchTime ? addBatchTime(this.endpointUrl) : this.endpointUrl
    const tryBeacon = !!navigator.sendBeacon && size < this.bytesLimit
    if (tryBeacon) {
      try {
        const isQueued = navigator.sendBeacon(url, data)
        if (isQueued) {
          return
        }
      } catch (e) {
        reportBeaconError(e)
      }
    }

    const transportIntrospection = (event: ProgressEvent) => {
      const req = event?.currentTarget as XMLHttpRequest
      if (req.status >= 200 && req.status < 300) {
        return
      }
      if (!hasReportedXhrError) {
        hasReportedXhrError = true
        addMonitoringMessage('XHR fallback failed', {
          on_line: navigator.onLine,
          size,
          url,
          try_beacon: tryBeacon,
          event: {
            is_trusted: event.isTrusted,
            total: event.total,
            loaded: event.loaded,
          },
          request: {
            status: req.status,
            ready_state: req.readyState,
            response_text: req.responseText.slice(0, 64),
          },
        })
      }
    }

    const request = new XMLHttpRequest()
    request.addEventListener(
      'loadend',
      monitor((event) => transportIntrospection(event))
    )
    request.open('POST', url, true)
    request.send(data)
  }
}

function addBatchTime(url: string) {
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}batch_time=${new Date().getTime()}`
}

let hasReportedBeaconError = false
function reportBeaconError(e: unknown) {
  if (!hasReportedBeaconError) {
    hasReportedBeaconError = true
    addErrorToMonitoringBatch(e)
  }
}

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
    private flushTimeout: number,
    private beforeUnloadCallback: () => void = noop
  ) {
    this.flushOnVisibilityHidden()
    this.flushPeriodically()
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
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
      this.flush()
    }
    this.push(processedMessage, messageBytesSize, key)
    if (this.isFull()) {
      this.flush()
    }
  }

  private process(message: Context) {
    const processedMessage = jsonStringify(message)!
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
    setTimeout(
      monitor(() => {
        this.flush()
        this.flushPeriodically()
      }),
      this.flushTimeout
    )
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
      addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, this.beforeUnloadCallback)

      /**
       * Only event that guarantee to fire on mobile devices when the page transitions to background state
       * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
       */
      addEventListener(document, DOM_EVENT.VISIBILITY_CHANGE, () => {
        if (document.visibilityState === 'hidden') {
          this.flush()
        }
      })
      /**
       * Safari does not support yet to send a request during:
       * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
       * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
       */
      addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => this.flush())
    }
  }
}
