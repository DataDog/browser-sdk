import { monitor } from './internalMonitoring'
import { normalizeUrl } from './urlPolyfill'

interface BrowserXHR extends XMLHttpRequest {
  _datadog_xhr: XhrStartContext
}

export interface XhrProxy<
  StartContext extends XhrStartContext = XhrStartContext,
  CompleteContext extends XhrCompleteContext = XhrCompleteContext
> {
  beforeSend: (callback: (context: StartContext, xhr: XMLHttpRequest) => void) => void
  onRequestComplete: (callback: (context: CompleteContext) => void) => void
}

export interface XhrStartContext {
  method: string
  url: string
  startTime: number

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

export interface XhrCompleteContext extends XhrStartContext {
  duration: number
  status: number
  response: string | undefined
}

let xhrProxySingleton: XhrProxy | undefined
const beforeSendCallbacks: Array<(context: XhrStartContext, xhr: XMLHttpRequest) => void> = []
const onRequestCompleteCallbacks: Array<(context: XhrCompleteContext) => void> = []
let originalXhrOpen: typeof XMLHttpRequest.prototype.open
let originalXhrSend: typeof XMLHttpRequest.prototype.send

export function startXhrProxy<
  StartContext extends XhrStartContext = XhrStartContext,
  CompleteContext extends XhrCompleteContext = XhrCompleteContext
>(): XhrProxy<StartContext, CompleteContext> {
  if (!xhrProxySingleton) {
    proxyXhr()
    xhrProxySingleton = {
      beforeSend(callback: (context: XhrStartContext, xhr: XMLHttpRequest) => void) {
        beforeSendCallbacks.push(callback)
      },
      onRequestComplete(callback: (context: XhrCompleteContext) => void) {
        onRequestCompleteCallbacks.push(callback)
      },
    }
  }
  return xhrProxySingleton as XhrProxy<StartContext, CompleteContext>
}

export function resetXhrProxy() {
  if (xhrProxySingleton) {
    xhrProxySingleton = undefined
    beforeSendCallbacks.splice(0, beforeSendCallbacks.length)
    onRequestCompleteCallbacks.splice(0, onRequestCompleteCallbacks.length)
    XMLHttpRequest.prototype.open = originalXhrOpen
    XMLHttpRequest.prototype.send = originalXhrSend
  }
}

function proxyXhr() {
  originalXhrOpen = XMLHttpRequest.prototype.open
  originalXhrSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = monitor(function(this: BrowserXHR, method: string, url: string) {
    this._datadog_xhr = {
      method,
      startTime: -1, // computed in send call
      url: normalizeUrl(url),
    }
    return originalXhrOpen.apply(this, arguments as any)
  })

  XMLHttpRequest.prototype.send = monitor(function(this: BrowserXHR, body: unknown) {
    if (this._datadog_xhr) {
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

        onRequestCompleteCallbacks.forEach((callback) => callback(this._datadog_xhr as XhrCompleteContext))
      }

      this.addEventListener('loadend', monitor(reportXhr))

      beforeSendCallbacks.forEach((callback) => callback(this._datadog_xhr, this))
    }

    return originalXhrSend.apply(this, arguments as any)
  })
}
