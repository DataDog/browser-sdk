import { instrumentMethodAndCallOriginal } from '../tools/instrumentMethod'
import { monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { Duration, RelativeTime, ClocksState } from '../tools/timeUtils'
import { elapsed, relativeNow, clocksNow, timeStampNow } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'
import { shallowClone } from '../tools/utils'

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
}

export type XhrContext = XhrOpenContext | XhrStartContext | XhrCompleteContext

let xhrObservable: Observable<XhrContext> | undefined
const xhrContexts = new WeakMap<XMLHttpRequest, XhrContext>()

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

function openXhr(this: XMLHttpRequest, method: string, url: string | URL) {
  xhrContexts.set(this, {
    state: 'open',
    method,
    url: normalizeUrl(url.toString()),
  })
}

function sendXhr(this: XMLHttpRequest, observable: Observable<XhrContext>) {
  const context = xhrContexts.get(this)
  if (!context) {
    return
  }

  const startContext = context as XhrStartContext
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

    const completeContext = context as XhrCompleteContext
    completeContext.state = 'complete'
    completeContext.duration = elapsed(startContext.startClocks.timeStamp, timeStampNow())
    completeContext.status = this.status
    observable.notify(shallowClone(completeContext))
  })
  this.addEventListener('loadend', onEnd)
  observable.notify(startContext)
}

function abortXhr(this: XMLHttpRequest) {
  const context = xhrContexts.get(this) as XhrStartContext | undefined
  if (context) {
    context.isAborted = true
  }
}
