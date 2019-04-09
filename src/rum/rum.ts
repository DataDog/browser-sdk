import { Logger } from '../core/logger'
import { monitor } from '../core/monitoring'
import { Observable } from '../core/observable'
import { Batch } from '../core/transport'
import * as utils from '../core/utils'
import { ErrorMessage } from '../errorCollection/errorCollection'

type RequestIdleCallbackHandle = number

interface Data {
  xhrCount: number
  errorCount: number
}

interface RequestIdleCallbackOptions {
  timeout: number
}

interface RequestIdleCallbackDeadline {
  readonly didTimeout: boolean
  timeRemaining: () => number
}

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void
  }
}

const RUM_EVENT_PREFIX = `[RUM Event]`

type EntryType =
  | 'animationDelay'
  | 'display'
  | 'firstIdle'
  | 'firstInput'
  | 'longtask'
  | 'navigation'
  | 'pageUnload'
  | 'paint'
  | 'responseDelay'
  | 'resource'

interface Message {
  data: any
  entryType: EntryType
}

export function startRum(errorReporting: Observable<ErrorMessage>, batch: Batch, logger: Logger) {
  const currentData: Data = { xhrCount: 0, errorCount: 0 }
  trackErrorCount(errorReporting, currentData)
  trackDisplay(logger)
  trackPerformanceTiming(logger, currentData)
  trackFirstIdle(logger)
  trackFirstInput(logger)
  trackInputDelay(logger)
  trackPageUnload(batch, logger, currentData)
}

export function log(logger: Logger, message: Message) {
  logger.log(`${RUM_EVENT_PREFIX} ${message.entryType}`, message)
}

function logPerformanceEntry(logger: Logger, entry: PerformanceEntry) {
  log(logger, { data: entry.toJSON(), entryType: entry.entryType as EntryType })
}

function trackErrorCount(errorReporting: Observable<ErrorMessage>, currentData: Data) {
  errorReporting.subscribe(() => {
    currentData.errorCount += 1
  })
}

function trackDisplay(logger: Logger) {
  log(logger, {
    data: {
      display: 1,
      startTime: utils.getTimeSinceLoading(),
    },
    entryType: 'display',
  })
}

export function trackPerformanceTiming(logger: Logger, currentData: Data) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        list.getEntries().forEach((entry: PerformanceEntry) => handlePerformanceEntry(entry, logger, currentData))
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })
  }
}

export function handlePerformanceEntry(entry: PerformanceEntry, logger: Logger, currentData: Data) {
  const entryType = entry.entryType
  if (entryType === 'paint') {
    log(logger, { entryType, data: { [entry.name]: entry.startTime } })
    return
  }

  if (isResourceEntry(entry)) {
    if (entry.name.startsWith(logger.getEndpoint())) {
      return
    }
    if (entry.initiatorType === 'xmlhttprequest') {
      currentData.xhrCount += 1
    }
  }

  logPerformanceEntry(logger, entry)
}

function isResourceEntry(entry: PerformanceEntry): entry is PerformanceResourceTiming {
  return entry.entryType === 'resource'
}

export function trackFirstIdle(logger: Logger) {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(
      monitor(() => {
        window.cancelIdleCallback(handle)
        log(logger, {
          data: {
            startTime: utils.getTimeSinceLoading(),
          },
          entryType: 'firstIdle',
        })
      })
    )
  }
}

function trackFirstInput(logger: Logger) {
  const options = { capture: true, passive: true }
  document.addEventListener('click', logFirstInputData, options)
  document.addEventListener('keydown', logFirstInputData, options)
  document.addEventListener('scroll', logFirstInputData, options)

  function logFirstInputData(event: Event) {
    document.removeEventListener('click', logFirstInputData, options)
    document.removeEventListener('keydown', logFirstInputData, options)
    document.removeEventListener('scroll', logFirstInputData, options)

    const startTime = utils.getTimeSinceLoading()
    const delay = startTime - event.timeStamp

    log(logger, {
      data: {
        delay,
        startTime,
      },
      entryType: 'firstInput',
    })
  }
}

interface Delay {
  entryType: EntryType
  threshold: number
}

/**
 * cf https://developers.google.com/web/fundamentals/performance/rail
 */
const DELAYS: { [key: string]: Delay } = {
  ANIMATION: {
    entryType: 'animationDelay',
    threshold: 10,
  },
  RESPONSE: {
    entryType: 'responseDelay',
    threshold: 100,
  },
}

/**
 * Avoid to spam with scroll events
 */
const DELAY_BETWEEN_DISTINCT_SCROLL = 2000

function trackInputDelay(logger: Logger) {
  const options = { capture: true, passive: true }
  document.addEventListener('click', logIfAboveThreshold(DELAYS.RESPONSE), options)
  document.addEventListener('keydown', logIfAboveThreshold(DELAYS.RESPONSE), options)
  document.addEventListener(
    'scroll',
    utils.throttle(logIfAboveThreshold(DELAYS.ANIMATION), DELAY_BETWEEN_DISTINCT_SCROLL),
    options
  )

  function logIfAboveThreshold({ entryType, threshold }: Delay) {
    return (event: Event) => {
      const startTime = utils.getTimeSinceLoading()
      const duration = startTime - event.timeStamp
      if (duration > threshold) {
        log(logger, {
          entryType,
          data: {
            duration,
            startTime,
          },
        })
      }
    }
  }
}

function trackPageUnload(batch: Batch, logger: Logger, currentData: Data) {
  batch.beforeFlushOnUnload(() => {
    const duration = utils.getTimeSinceLoading()
    // We want a throughput per minute to have meaningful data.
    const throughput = (currentData.xhrCount / duration) * 1000 * 60

    log(logger, {
      data: {
        duration,
        errorCount: currentData.errorCount,
        throughput: utils.round(throughput, 1),
      },
      entryType: 'pageUnload',
    })
  })
}
