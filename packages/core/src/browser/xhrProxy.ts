import { callMonitored, monitor } from '../domain/internalMonitoring'
import { instrumentMethod } from '../tools/instrumentMethod'
import { Observable } from '../tools/observable'
import { Duration, elapsed, relativeNow, RelativeTime, ClocksState, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'

interface BrowserXHR<T> extends XMLHttpRequest {
  /**
   * @deprecated this property is shared by both logs and rum and can be used by different code
   * versions depending on customer setup. To improve reliability and make SDKs independent, this
   * property should be removed in the future, but this would be a breaking change since some
   * customers are using it.
   *
   * TODO(v4): replace this property with a weakmap index
   */
  _datadog_xhr?: T
}

export interface XhrOpenContext {
  state: 'open'
  method: string
  url: string
}

export interface XhrStartContext extends Omit<XhrOpenContext, 'state'> {
  state: 'start'
  startTime: RelativeTime // deprecated
  startClocks: ClocksState
  isAborted: boolean
  xhr: XMLHttpRequest
}

export interface XhrCompleteContext extends Omit<XhrStartContext, 'state'> {
  state: 'complete'
  duration: Duration
  status: number
  responseText: string | undefined
}

export type XhrContext = XhrOpenContext | XhrStartContext | XhrCompleteContext

let xhrObservable: Observable<XhrContext> | undefined

export function initXhrObservable() {
  if (!xhrObservable) {
    xhrObservable = createXhrObservable()
  }
  return xhrObservable
}

function createXhrObservable() {
  const observable = new Observable<XhrContext>(() => {
    const { stop: stopInstrumentingStart } = instrumentMethod(
      XMLHttpRequest.prototype,
      'open',
      (original) =>
        function (method, url) {
          callMonitored(openXhr, this, [method, url])
          return original.apply(this, arguments as any)
        }
    )

    const { stop: stopInstrumentingSend } = instrumentMethod(
      XMLHttpRequest.prototype,
      'send',
      (original) =>
        function () {
          callMonitored(sendXhr, this, [observable])
          return original.apply(this, arguments as any)
        }
    )

    const { stop: stopInstrumentingAbort } = instrumentMethod(
      XMLHttpRequest.prototype,
      'abort',
      (original) =>
        function () {
          callMonitored(abortXhr, this, [])
          return original.apply(this, arguments as any)
        }
    )

    return () => {
      stopInstrumentingStart()
      stopInstrumentingSend()
      stopInstrumentingAbort()
    }
  })
  return observable
}

function openXhr(this: BrowserXHR<XhrOpenContext>, method: string, url: string) {
  // WARN: since this data structure is tied to the instance, it is shared by both logs and rum
  // and can be used by different code versions depending on customer setup
  // so it should stay compatible with older versions
  this._datadog_xhr = {
    state: 'open',
    method,
    url: normalizeUrl(url),
  }
}

function sendXhr(this: BrowserXHR<XhrStartContext>, observable: Observable<XhrContext>) {
  if (!this._datadog_xhr) {
    return
  }

  const startContext = this._datadog_xhr
  startContext.state = 'start'
  startContext.startTime = relativeNow()
  startContext.startClocks = clocksNow()
  startContext.isAborted = false
  startContext.xhr = this

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

    const completeContext = (this._datadog_xhr! as unknown) as XhrCompleteContext
    completeContext.state = 'complete'
    completeContext.duration = elapsed(startContext.startClocks.timeStamp, timeStampNow())
    completeContext.responseText = this.response as string | undefined
    completeContext.status = this.status
    observable.notify({ ...completeContext })
  })
  this.onreadystatechange = onreadystatechange
  this.addEventListener('loadend', onEnd)
  observable.notify(startContext)
}

function abortXhr(this: BrowserXHR<XhrStartContext>) {
  if (this._datadog_xhr) {
    this._datadog_xhr.isAborted = true
  }
}
