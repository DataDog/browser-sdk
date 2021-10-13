import { monitor } from '../domain/internalMonitoring'
import { instrumentMethodAndCallOriginal } from '../tools/instrumentMethod'
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
    const { stop: stopInstrumentingStart } = instrumentMethodAndCallOriginal(XMLHttpRequest.prototype, 'open', {
      before: openXhr,
    })

    const { stop: stopInstrumentingSend } = instrumentMethodAndCallOriginal(XMLHttpRequest.prototype, 'send', {
      before() {
        sendXhr.call(this, observable)
      },
    })

    const { stop: stopInstrumentingAbort } = instrumentMethodAndCallOriginal(XMLHttpRequest.prototype, 'abort', {
      before: abortXhr,
    })

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

  const { stop: stopInstrumentingOnReadyStateChange } = instrumentMethodAndCallOriginal(this, 'onreadystatechange', {
    before() {
      if (this.readyState === XMLHttpRequest.DONE) {
        // Try to report the XHR as soon as possible, because the XHR may be mutated by the
        // application during a future event. For example, Angular is calling .abort() on
        // completed requests during a onreadystatechange event, so the status becomes '0'
        // before the request is collected.
        onEnd()
      }
    },
  })

  const onEnd = monitor(() => {
    this.removeEventListener('loadend', onEnd)
    stopInstrumentingOnReadyStateChange()
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
  this.addEventListener('loadend', onEnd)
  observable.notify(startContext)
}

function abortXhr(this: BrowserXHR<XhrStartContext>) {
  if (this._datadog_xhr) {
    this._datadog_xhr.isAborted = true
  }
}
