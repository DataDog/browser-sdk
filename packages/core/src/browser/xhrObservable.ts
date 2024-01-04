import { instrumentMethodAndCallOriginal } from '../tools/instrumentMethod'
import { Observable } from '../tools/observable'
import type { Duration, ClocksState } from '../tools/utils/timeUtils'
import { elapsed, clocksNow, timeStampNow } from '../tools/utils/timeUtils'
import { normalizeUrl } from '../tools/utils/urlPolyfill'
import { shallowClone } from '../tools/utils/objectUtils'
import type { Configuration } from '../domain/configuration'
import { addEventListener } from './addEventListener'

export interface XhrOpenContext {
  state: 'open'
  method: string
  url: string
}

export interface XhrStartContext extends Omit<XhrOpenContext, 'state'> {
  state: 'start'
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

export function initXhrObservable(configuration: Configuration) {
  if (!xhrObservable) {
    xhrObservable = createXhrObservable(configuration)
  }
  return xhrObservable
}

function createXhrObservable(configuration: Configuration) {
  return new Observable<XhrContext>((observable) => {
    const { stop: stopInstrumentingStart } = instrumentMethodAndCallOriginal(XMLHttpRequest.prototype, 'open', {
      before: openXhr,
    })

    const { stop: stopInstrumentingSend } = instrumentMethodAndCallOriginal(XMLHttpRequest.prototype, 'send', {
      before() {
        sendXhr.call(this, configuration, observable)
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
}

function openXhr(this: XMLHttpRequest, method: string, url: string | URL | undefined | null) {
  xhrContexts.set(this, {
    state: 'open',
    method: method.toUpperCase(),
    url: normalizeUrl(String(url)),
  })
}

function sendXhr(this: XMLHttpRequest, configuration: Configuration, observable: Observable<XhrContext>) {
  const context = xhrContexts.get(this)
  if (!context) {
    return
  }

  const startContext = context as XhrStartContext
  startContext.state = 'start'
  startContext.startClocks = clocksNow()
  startContext.isAborted = false
  startContext.xhr = this

  let hasBeenReported = false

  const { stop: stopInstrumentingOnReadyStateChange } = instrumentMethodAndCallOriginal(this, 'onreadystatechange', {
    before() {
      if (this.readyState === XMLHttpRequest.DONE) {
        // Try to report the XHR as soon as possible, because the XHR may be mutated by the
        // application during a future event. For example, Angular is calling .abort() on
        // completed requests during an onreadystatechange event, so the status becomes '0'
        // before the request is collected.
        onEnd()
      }
    },
  })

  const onEnd = () => {
    unsubscribeLoadEndListener()
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
  }

  const { stop: unsubscribeLoadEndListener } = addEventListener(configuration, this, 'loadend', onEnd)

  observable.notify(startContext)
}

function abortXhr(this: XMLHttpRequest) {
  const context = xhrContexts.get(this) as XhrStartContext | undefined
  if (context) {
    context.isAborted = true
  }
}
