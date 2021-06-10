import { callMonitored, monitor } from '../domain/internalMonitoring'
import { Duration, elapsed, relativeNow, RelativeTime, ClocksState, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

interface BrowserXHR<T extends XhrOpenContext> extends XMLHttpRequest {
  _datadog_xhr?: T
}

export interface XhrProxy<
  StartContext extends XhrStartContext = XhrStartContext,
  CompleteContext extends XhrCompleteContext = XhrCompleteContext
> {
  beforeSend: (callback: (context: StartContext, xhr: XMLHttpRequest) => void) => void
  onRequestComplete: (callback: (context: CompleteContext) => void) => void
}

export interface XhrOpenContext {
  method: string
  url: string
}

export interface XhrStartContext extends XhrOpenContext {
  startTime: RelativeTime // deprecated
  startClocks: ClocksState
  isAborted: boolean
  /**
   * allow clients to enhance the context
   */
  [key: string]: unknown
}

export interface XhrCompleteContext extends XhrStartContext {
  duration: Duration
  status: number
  responseText: string | undefined
  xhr: XMLHttpRequest
}

let xhrProxySingleton: XhrProxy | undefined
const beforeSendCallbacks: Array<(context: XhrStartContext, xhr: XMLHttpRequest) => void> = []
const onRequestCompleteCallbacks: Array<(context: XhrCompleteContext) => void> = []
let originalXhrOpen: typeof XMLHttpRequest.prototype.open
let originalXhrSend: typeof XMLHttpRequest.prototype.send
let originalXhrAbort: typeof XMLHttpRequest.prototype.abort

export function startXhrProxy<
  StartContext extends XhrStartContext = XhrStartContext,
  CompleteContext extends XhrCompleteContext = XhrCompleteContext
>(): XhrProxy<StartContext, CompleteContext> {
  if (!xhrProxySingleton) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalXhrOpen = XMLHttpRequest.prototype.open
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalXhrSend = XMLHttpRequest.prototype.send
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalXhrAbort = XMLHttpRequest.prototype.abort
    XMLHttpRequest.prototype.open = openXhr
    XMLHttpRequest.prototype.send = sendXhr
    XMLHttpRequest.prototype.abort = abortXhr

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
    beforeSendCallbacks.length = 0
    onRequestCompleteCallbacks.length = 0
    XMLHttpRequest.prototype.open = originalXhrOpen
    XMLHttpRequest.prototype.send = originalXhrSend
    XMLHttpRequest.prototype.abort = originalXhrAbort
  }
}

function openXhr(this: BrowserXHR<XhrOpenContext>, method: string, url: string) {
  callMonitored(() => {
    // WARN: since this data structure is tied to the instance, it is shared by both logs and rum
    // and can be used by different code versions depending on customer setup
    // so it should stay compatible with older versions
    this._datadog_xhr = {
      method,
      url: normalizeUrl(url),
    }
  })
  return originalXhrOpen.apply(this, arguments as any)
}

function sendXhr(this: BrowserXHR<XhrStartContext>) {
  callMonitored(() => {
    if (!this._datadog_xhr) {
      return
    }

    this._datadog_xhr.startTime = relativeNow()
    this._datadog_xhr.startClocks = clocksNow()
    this._datadog_xhr.isAborted = false

    let hasBeenReported = false
    const originalOnreadystatechange = this.onreadystatechange
    const onreadystatechange = function (this: BrowserXHR<XhrStartContext>) {
      if (this.readyState === XMLHttpRequest.DONE) {
        // Try to report the XHR as soon as possible, because the XHR may be mutated by the
        // application during a future event. For example, Angular is calling .abort() on
        // completed requests during a onreadystatechange event, so the status becomes '0'
        // before the request is collected.
        onEnd()
      }

      if (originalOnreadystatechange) {
        originalOnreadystatechange.apply(this, arguments as any)
      }
    }

    const onEnd = monitor(() => {
      this.removeEventListener('loadend', onEnd)
      // if the onreadystatechange hasn't been overridden by the user after the send()
      if (this.onreadystatechange === onreadystatechange) {
        this.onreadystatechange = originalOnreadystatechange
      }
      if (hasBeenReported) {
        return
      }
      hasBeenReported = true
      reportXhr(this as BrowserXHR<XhrCompleteContext>)
    })
    this.onreadystatechange = onreadystatechange
    this.addEventListener('loadend', onEnd)

    beforeSendCallbacks.forEach((callback) => callback(this._datadog_xhr!, this))
  })

  return originalXhrSend.apply(this, arguments as any)
}

function abortXhr(this: BrowserXHR<XhrStartContext>) {
  callMonitored(() => {
    if (this._datadog_xhr) {
      this._datadog_xhr.isAborted = true
    }
  })
  return originalXhrAbort.apply(this, arguments as any)
}

function reportXhr(xhr: BrowserXHR<XhrCompleteContext>) {
  xhr._datadog_xhr!.duration = elapsed(xhr._datadog_xhr!.startClocks.timeStamp, timeStampNow())
  xhr._datadog_xhr!.responseText = xhr.response as string | undefined
  xhr._datadog_xhr!.status = xhr.status
  xhr._datadog_xhr!.xhr = xhr

  onRequestCompleteCallbacks.forEach((callback) => callback({ ...xhr._datadog_xhr! }))
}
