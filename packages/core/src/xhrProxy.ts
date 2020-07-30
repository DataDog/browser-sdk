import { monitor } from './internalMonitoring'
import { normalizeUrl } from './urlPolyfill'

interface BrowserXHR extends XMLHttpRequest {
  _datadog_xhr: Partial<XhrContext>
}

export interface XhrProxy {
  beforeSend: (callback: (context: Partial<XhrContext>) => void) => void
  onRequestComplete: (callback: (context: XhrContext) => void) => void
  reset: () => void
}

export interface XhrContext {
  method: string
  url: string
  startTime: number
  duration: number
  status: number
  response: string | undefined

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

const beforeSendCallbacks: Array<(context: Partial<XhrContext>) => void> = []
const onRequestCompleteCallbacks: Array<(context: XhrContext) => void> = []
let hasBeenStarted = false
let originalXhrOpen: typeof XMLHttpRequest.prototype.open
let originalXhrSend: typeof XMLHttpRequest.prototype.send

export function startXhrProxy(): XhrProxy {
  if (!hasBeenStarted) {
    hasBeenStarted = true
    proxyXhr()
  }
  return {
    beforeSend(callback: (context: Partial<XhrContext>) => void) {
      beforeSendCallbacks.push(callback)
    },
    onRequestComplete(callback: (context: XhrContext) => void) {
      onRequestCompleteCallbacks.push(callback)
    },
    reset() {
      hasBeenStarted = false
      beforeSendCallbacks.splice(0, beforeSendCallbacks.length)
      onRequestCompleteCallbacks.splice(0, onRequestCompleteCallbacks.length)
      XMLHttpRequest.prototype.open = originalXhrOpen
      XMLHttpRequest.prototype.send = originalXhrSend
    },
  }
}

function proxyXhr() {
  originalXhrOpen = XMLHttpRequest.prototype.open
  originalXhrSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = monitor(function(this: BrowserXHR, method: string, url: string) {
    this._datadog_xhr = {
      method,
      url: normalizeUrl(url),
    }
    return originalXhrOpen.apply(this, arguments as any)
  })

  XMLHttpRequest.prototype.send = function(this: BrowserXHR, body: unknown) {
    this._datadog_xhr.startTime = performance.now()

    const originalOnreadystatechange = this.onreadystatechange

    this.onreadystatechange = function() {
      if (this.readyState === XMLHttpRequest.DONE) {
        monitor(reportXhr)()
      }

      if (originalOnreadystatechange) {
        originalOnreadystatechange.apply(this, arguments as any)
      }
    }

    let hasBeenReported = false
    const reportXhr = () => {
      if (hasBeenReported) {
        return
      }
      hasBeenReported = true

      this._datadog_xhr.duration = performance.now() - this._datadog_xhr.startTime!
      this._datadog_xhr.response = this.response as string | undefined
      this._datadog_xhr.status = this.status

      onRequestCompleteCallbacks.forEach((callback) => callback(this._datadog_xhr as XhrContext))
    }

    this.addEventListener('loadend', monitor(reportXhr))

    beforeSendCallbacks.forEach((callback) => callback(this._datadog_xhr))

    return originalXhrSend.apply(this, arguments as any)
  }
}
