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

export function rumModule(batch: Batch, logger: Logger) {
  trackDisplay(logger)
  trackPerformanceTiming(logger)
  trackFirstIdle(logger)
  trackFirstInput(logger)
  trackInputDelay(logger)
  trackPageDuration(batch, logger)
}

function trackDisplay(logger: Logger) {
  logger.log(`${RUM_EVENT_PREFIX} display`, {
    data: {
      entryType: 'display',
      startTime: performance.now(),
    },
  })
}

function trackPerformanceTiming(logger: Logger) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries()
        const data = entries.map((e) => e.toJSON())
        logger.log(`${RUM_EVENT_PREFIX} ${entries[0].entryType}`, { data })
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })
  }
}

function trackFirstIdle(logger: Logger) {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(
      monitor(() => {
        window.cancelIdleCallback(handle)
        logger.log(`${RUM_EVENT_PREFIX} first idle`, {
          data: {
            entryType: 'firstIdle',
            startTime: performance.now(),
          },
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

    logger.log(`${RUM_EVENT_PREFIX} first input`, {
      data: {
        delay,
        startTime,
        entryType: 'firstInput',
      },
    })
  }
}

interface Delay {
  entryType: string
  threshold: number
}

/**
 * cf https://developers.google.com/web/fundamentals/performance/rail
 */
const DELAYS = {
  ANIMATION: {
    entryType: 'animation delay',
    threshold: 10,
  },
  RESPONSE: {
    entryType: 'response delay',
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
        logger.log(`${RUM_EVENT_PREFIX} ${entryType}`, {
          data: {
            duration,
            entryType,
            startTime,
          },
        })
      }
    }
  }
}

function trackPageDuration(batch: Batch, logger: Logger) {
  batch.beforeFlushOnUnload(() => {
    logger.log(`${RUM_EVENT_PREFIX} page unload`, {
      data: {
        duration: performance.now(),
        entryType: 'page unload',
      },
    })
  })
}
