import { Logger } from '../core/logger'
import { monitor } from '../core/monitoring'
import { Batch } from '../core/transport'
import { throttle } from '../core/util'

type RequestIdleCallbackHandle = number

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

export function startRum(batch: Batch, logger: Logger) {
  trackDisplay(logger)
  trackPerformanceTiming(logger)
  trackFirstIdle(logger)
  trackFirstInput(logger)
  trackInputDelay(logger)
  trackPageDuration(batch, logger)
}

function log(logger: Logger, message: Message) {
  logger.log(`${RUM_EVENT_PREFIX} ${message.entryType}`, message)
}

function trackDisplay(logger: Logger) {
  log(logger, {
    data: {
      startTime: performance.now(),
    },
    entryType: 'display',
  })
}

function trackPerformanceTiming(logger: Logger) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        list.getEntries().forEach((entry) => {
          if (isPerformanceEntryAllowed(logger, entry)) {
            log(logger, { data: entry.toJSON(), entryType: entry.entryType as EntryType })
          }
        })
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })
  }
}

function isResourceEntryTiming(entry: PerformanceEntry): entry is PerformanceResourceTiming {
  return entry.entryType === 'resource'
}

export function isPerformanceEntryAllowed(logger: Logger, entry: PerformanceEntry) {
  const isBlacklisted = isResourceEntryTiming(entry) && entry.name.startsWith(logger.getEndpoint())
  return !isBlacklisted
}

export function trackFirstIdle(logger: Logger) {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(
      monitor(() => {
        window.cancelIdleCallback(handle)
        log(logger, {
          data: {
            startTime: performance.now(),
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

    const startTime = performance.now()
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
    throttle(logIfAboveThreshold(DELAYS.ANIMATION), DELAY_BETWEEN_DISTINCT_SCROLL),
    options
  )

  function logIfAboveThreshold({ entryType, threshold }: Delay) {
    return (event: Event) => {
      const startTime = performance.now()
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

function trackPageDuration(batch: Batch, logger: Logger) {
  batch.beforeFlushOnUnload(() => {
    log(logger, {
      data: {
        duration: performance.now(),
      },
      entryType: 'pageUnload',
    })
  })
}
