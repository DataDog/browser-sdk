import { instrumentMethod } from '../tools/instrumentMethod'
import { callMonitored, monitor } from '../tools/monitor'
import { Observable } from '../tools/observable'
import type { Duration, ClocksState, RelativeTime } from '../tools/timeUtils'
import { elapsed, clocksNow, timeStampNow, addDuration } from '../tools/timeUtils'
import { normalizeUrl } from '../tools/urlPolyfill'
import { toValidEntry } from '../tools/resourceUtils'

import type { RumPerformanceResourceTiming } from '../../../rum-core/src/browser/performanceCollection'

interface FetchContextBase {
  method: string
  startClocks: ClocksState
  input: RequestInfo
  init?: RequestInit
  url: string
}

export interface FetchStartContext extends FetchContextBase {
  state: 'start'
}

export interface FetchCompleteContext extends FetchContextBase {
  state: 'complete'
  duration: Duration
  status: number
  response?: Response
  responseType?: string
  isAborted: boolean
  error?: Error
  matchingTiming?: RumPerformanceResourceTiming
}

export type FetchContext = FetchStartContext | FetchCompleteContext

let fetchObservable: Observable<FetchContext> | undefined

export function initFetchObservable() {
  if (!fetchObservable) {
    fetchObservable = createFetchObservable()
  }
  return fetchObservable
}

function createFetchObservable() {
  const observable = new Observable<FetchContext>(() => {
    if (!window.fetch) {
      return
    }

    const { stop } = instrumentMethod(
      window,
      'fetch',
      (originalFetch) =>
        function (input, init) {
          let responsePromise: Promise<Response>

          const context = callMonitored(beforeSend, null, [observable, input, init])
          if (context) {
            responsePromise = originalFetch.call(this, context.input, context.init)
            callMonitored(afterSend, null, [observable, responsePromise, context])
          } else {
            responsePromise = originalFetch.call(this, input, init)
          }

          return responsePromise
        }
    )

    return stop
  })

  return observable
}

function beforeSend(observable: Observable<FetchContext>, input: RequestInfo, init?: RequestInit) {
  const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
  const url = normalizeUrl((typeof input === 'object' && input.url) || (input as string))
  const startClocks = clocksNow()

  const context: FetchStartContext = {
    state: 'start',
    init,
    input,
    method,
    startClocks,
    url,
  }

  observable.notify(context)

  return context
}

export const REPORT_FETCH_TIMER = 5000

function afterSend(
  observable: Observable<FetchContext>,
  responsePromise: Promise<Response>,
  startContext: FetchStartContext
) {
  const constructContext = (response: Response | Error) => {
    const context = startContext as unknown as FetchCompleteContext
    context.state = 'complete'
    context.duration = elapsed(context.startClocks.timeStamp, timeStampNow())

    if ('stack' in response || response instanceof Error) {
      context.status = 0
      context.isAborted = response instanceof DOMException && response.code === DOMException.ABORT_ERR
      context.error = response
    } else if ('status' in response) {
      context.response = response
      context.responseType = response.type
      context.status = response.status
      context.isAborted = false
    }
    return context
  }

  const reportFetch = (response: Response | Error) => {
    const context = constructContext(response)
    observable.notify(context)
  }

  const reportFetchOnPerformanceObserverCallback = (response: Response) => {
    const context = constructContext(response)

    let timeOutId: null | number = null
    Promise.race([
      new Promise((resolve) => {
        const observer = new PerformanceObserver((list, observer) => {
          const entries = list.getEntries() as unknown as RumPerformanceResourceTiming[]
          entries
            .filter(toValidEntry)
            .filter((entry) => entry.initiatorType === 'fetch')
            .filter((entry) => entry.name === response?.url)
            .filter((entry) =>
              isBetween(
                { startTime: entry.startTime, duration: context.duration },
                context.startClocks.relative,
                endTime({ startTime: context.startClocks.relative, duration: context.duration })
              )
            )

          if (entries.length) {
            // TODO: if entries.length > 1 then we should report
            context.matchingTiming = entries[-1]
            observable.notify(context)
            observer.disconnect()
            resolve(null)
          }
        })
        observer.observe({ entryTypes: ['resource'] })
      }),
      new Promise((resolve) => {
        timeOutId = setTimeout(
          monitor(() => {
            observable.notify(context)
            resolve(null)
          }),
          REPORT_FETCH_TIMER
        )
      }),
    ])
      .catch(() => observable.notify(context))
      // @ts-ignore: if a browser supports fetch, it likely supports finally
      .finally(reset)

    function reset() {
      timeOutId && clearTimeout(timeOutId)
      timeOutId = null
    }
  }

  responsePromise.then(
    monitor((response) => (response.ok ? reportFetchOnPerformanceObserverCallback(response) : reportFetch(response))),
    monitor(reportFetch)
  )
}

interface Timing {
  startTime: RelativeTime
  duration: Duration
}

function endTime(timing: Timing) {
  return addDuration(timing.startTime, timing.duration)
}

function isBetween(timing: Timing, start: RelativeTime, end: RelativeTime) {
  const errorMargin = 1 as Duration
  return timing.startTime >= start - errorMargin && endTime(timing) <= addDuration(end, errorMargin)
}
