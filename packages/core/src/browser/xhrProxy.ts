import { functionName } from '..'
import { callMonitored } from '../domain/internalMonitoring'
import { Duration, elapsed, relativeNow, RelativeTime, ClocksState, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

interface BrowserXHR<T extends XhrOpenContext = XhrStartContext> extends XMLHttpRequest {
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
  originalOnReadyStateChange: ((this: XMLHttpRequest, ev: Event) => any) | null
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
  response: string | undefined
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
      // Keep track of the user onreadystatechange to be able to call it after us
      originalOnReadyStateChange: getOriginalOnReadyStateChange(this),
    }

    // To avoid adding listeners each time 'open()' is called,
    // we take advantage of the automatic listener discarding if multiple identical EventListeners are registered
    // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#multiple_identical_event_listeners
    this.addEventListener('loadend', reportXhr)

    // Bind readystatechange with addEventListener and attribute affectation
    // to ensure not to be overridden after or before the xhr open is called
    this.addEventListener('readystatechange', onReadyStateChange)
    this.onreadystatechange = datadogOnReadyStateChangeFromProperty
  })
  return originalXhrOpen.apply(this, arguments as any)
}

function sendXhr(this: BrowserXHR) {
  callMonitored(() => {
    if (!this._datadog_xhr) {
      return
    }
    this._datadog_xhr = {
      ...this._datadog_xhr,
      startTime: relativeNow(),
      startClocks: clocksNow(),
      isAborted: false,
    }

    beforeSendCallbacks.forEach((callback) => callback(this._datadog_xhr!, this))
  })

  return originalXhrSend.apply(this, arguments as any)
}

function abortXhr(this: BrowserXHR) {
  callMonitored(() => {
    if (this._datadog_xhr) {
      this._datadog_xhr.isAborted = true
    }
  })
  return originalXhrAbort.apply(this, arguments as any)
}

// prefix the function name to avoid overlap with the end user for getOriginalOnReadyStateChange()
function datadogOnReadyStateChangeFromProperty(this: BrowserXHR) {
  onReadyStateChange.call(this)

  const originalOnReadyStateChange = getOriginalOnReadyStateChange(this)
  if (originalOnReadyStateChange) {
    originalOnReadyStateChange.apply(this, arguments as any)
  }
}

function onReadyStateChange(this: BrowserXHR) {
  if (this.readyState === XMLHttpRequest.DONE) {
    // Try to report the XHR as soon as possible, because the XHR may be mutated by the
    // application during a future event. For example, Angular is calling .abort() on
    // completed requests during a onreadystatechange event, so the status becomes '0'
    // before the request is collected.
    // https://github.com/angular/angular/blob/master/packages/common/http/src/xhr.ts
    reportXhr.call(this)
  }
}

function reportXhr(this: BrowserXHR) {
  callMonitored(() => {
    const xhrCompleteContext: XhrCompleteContext = {
      ...this._datadog_xhr!,
      duration: elapsed(this._datadog_xhr!.startClocks.timeStamp, timeStampNow()),
      response: this.response as string | undefined,
      status: this.status,
    }

    onRequestCompleteCallbacks.forEach((callback) => callback(xhrCompleteContext))
    // Unsubscribe to avoid being reported twice
    this.removeEventListener('readystatechange', onReadyStateChange)
    this.removeEventListener('loadend', reportXhr)
    this.onreadystatechange = getOriginalOnReadyStateChange(this)
  })
}

function getOriginalOnReadyStateChange(xhr: BrowserXHR<XhrOpenContext> | BrowserXHR<XhrStartContext>) {
  // Check if the onreadystatechange has changed between the open() and the async onreadystatechange callback
  // and get xhr.onreadystatechange instead of originalOnreadystatechange
  // In the case where DD_RUM and DD_LOGS are in the page the comparison by reference miss
  // therefore we check the function name to avoid recursive calls
  return functionName(xhr.onreadystatechange) !== functionName(datadogOnReadyStateChangeFromProperty)
    ? xhr.onreadystatechange
    : xhr._datadog_xhr?.originalOnReadyStateChange ?? null
}
