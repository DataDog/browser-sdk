/* eslint-disable no-underscore-dangle */
import { monitor, callMonitored } from '../domain/internalMonitoring'
import { Duration, elapsed, relativeNow, RelativeTime } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

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
  startTime: RelativeTime

  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

export interface XhrCompleteContext extends XhrStartContext {
  duration: Duration
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
  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalXhrOpen = XMLHttpRequest.prototype.open
  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalXhrSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: BrowserXHR, method: string, url: string) {
    callMonitored(() => {
      // WARN: since this data structure is tied to the instance, it is shared by both logs and rum
      // and can be used by different code versions depending on customer setup
      // so it should stay compatible with older versions
      this._datadog_xhr = {
        method,
        startTime: -1 as RelativeTime, // computed in send call
        url: normalizeUrl(url),
      }
    })
    return originalXhrOpen.apply(this, arguments as any)
  }

  XMLHttpRequest.prototype.send = function (this: BrowserXHR) {
    callMonitored(() => {
      if (this._datadog_xhr) {
        const xhrContext = this._datadog_xhr as XhrStartContext & Partial<XhrCompleteContext>
        xhrContext.startTime = relativeNow()

        const originalOnreadystatechange = this.onreadystatechange

        this.onreadystatechange = function () {
          if (this.readyState === XMLHttpRequest.DONE) {
            callMonitored(reportXhr)
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

          xhrContext.duration = elapsed(xhrContext.startTime, relativeNow())
          xhrContext.response = this.response as string | undefined
          xhrContext.status = this.status

          onRequestCompleteCallbacks.forEach((callback) => callback(xhrContext as XhrCompleteContext))
        }

        this.addEventListener('loadend', monitor(reportXhr))

        beforeSendCallbacks.forEach((callback) => callback(xhrContext, this))
      }
    })

    return originalXhrSend.apply(this, arguments as any)
  }
}
