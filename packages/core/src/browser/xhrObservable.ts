import type { InstrumentedMethodCall } from '../tools/instrumentMethod'
import { instrumentMethod } from '../tools/instrumentMethod'
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
  handlingStack?: string
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
    const { stop: stopInstrumentingStart } = instrumentMethod(XMLHttpRequest.prototype, 'open', openXhr)

    const { stop: stopInstrumentingSend } = instrumentMethod(
      XMLHttpRequest.prototype,
      'send',
      (call) => {
        sendXhr(call, configuration, observable)
      },
      { computeHandlingStack: true }
    )

    const { stop: stopInstrumentingAbort } = instrumentMethod(XMLHttpRequest.prototype, 'abort', abortXhr)

    return () => {
      stopInstrumentingStart()
      stopInstrumentingSend()
      stopInstrumentingAbort()
    }
  })
}

function openXhr({ target: xhr, parameters: [method, url] }: InstrumentedMethodCall<XMLHttpRequest, 'open'>) {
  xhrContexts.set(xhr, {
    state: 'open',
    method: String(method).toUpperCase(),
    url: normalizeUrl(String(url)),
  })
}

function sendXhr(
  { target: xhr, handlingStack }: InstrumentedMethodCall<XMLHttpRequest, 'send'>,
  configuration: Configuration,
  observable: Observable<XhrContext>
) {
  const context = xhrContexts.get(xhr)
  if (!context) {
    return
  }

  const startContext = context as XhrStartContext
  startContext.state = 'start'
  startContext.startClocks = clocksNow()
  startContext.isAborted = false
  startContext.xhr = xhr
  startContext.handlingStack = handlingStack

  let hasBeenReported = false

  const { stop: stopInstrumentingOnReadyStateChange } = instrumentMethod(xhr, 'onreadystatechange', () => {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      // Try to report the XHR as soon as possible, because the XHR may be mutated by the
      // application during a future event. For example, Angular is calling .abort() on
      // completed requests during an onreadystatechange event, so the status becomes '0'
      // before the request is collected.
      onEnd()
    }
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
    completeContext.status = xhr.status
    observable.notify(shallowClone(completeContext))
  }

  const { stop: unsubscribeLoadEndListener } = addEventListener(configuration, xhr, 'loadend', onEnd)

  observable.notify(startContext)
}

function abortXhr({ target: xhr }: InstrumentedMethodCall<XMLHttpRequest, 'abort'>) {
  const context = xhrContexts.get(xhr) as XhrStartContext | undefined
  if (context) {
    context.isAborted = true
  }
}
