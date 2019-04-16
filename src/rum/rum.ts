import { Configuration } from '../core/configuration'
import { getCommonContext, getGlobalContext } from '../core/context'
import { monitor } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'
import * as utils from '../core/utils'
import { ErrorObservable } from '../errorCollection/errorCollection'

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

export interface RumMessage {
  data: any
  entryType: EntryType
}

type RumBatch = Batch<RumMessage>

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

export function startRum(errorObservable: ErrorObservable, configuration: Configuration) {
  const batch = new Batch<RumMessage>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
      ...getGlobalContext(),
    })
  )
  const currentData: Data = { xhrCount: 0, errorCount: 0 }

  trackErrorCount(errorObservable, currentData)
  trackDisplay(batch)
  trackPerformanceTiming(batch, currentData, configuration)
  trackFirstIdle(batch)
  trackFirstInput(batch)
  trackInputDelay(batch)
  trackPageUnload(batch, currentData)
}

function trackErrorCount(errorObservable: ErrorObservable, currentData: Data) {
  errorObservable.subscribe(() => {
    currentData.errorCount += 1
  })
}

function trackDisplay(batch: RumBatch) {
  batch.add({
    data: {
      display: 1,
      startTime: utils.getTimeSinceLoading(),
    },
    entryType: 'display',
  })
}

export function trackPerformanceTiming(batch: RumBatch, currentData: Data, configuration: Configuration) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        list
          .getEntries()
          .forEach((entry: PerformanceEntry) => handlePerformanceEntry(entry, batch, currentData, configuration))
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })
  }
}

export function handlePerformanceEntry(
  entry: PerformanceEntry,
  batch: RumBatch,
  currentData: Data,
  configuration: Configuration
) {
  const entryType = entry.entryType
  if (entryType === 'paint') {
    batch.add({ entryType, data: { [entry.name]: entry.startTime } })
    return
  }

  if (isResourceEntry(entry)) {
    if (isBrowserAgentRequest(entry.name, configuration)) {
      return
    }
    if (entry.initiatorType === 'xmlhttprequest') {
      currentData.xhrCount += 1
    }

    batch.add({ data: formatResourceEntry(entry), entryType: entry.entryType as EntryType })
    return
  }

  batch.add({ data: entry.toJSON(), entryType: entry.entryType as EntryType })
}

function formatResourceEntry(entry: PerformanceResourceTiming) {
  const resourceEntry = entry.toJSON()
  resourceEntry.redirectDuration = entry.redirectEnd - entry.redirectStart
  resourceEntry.domainLookupDuration = entry.domainLookupEnd - entry.domainLookupStart
  resourceEntry.connectionDuration = entry.connectEnd - entry.connectStart
  resourceEntry.secureConnectionDuration =
    entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0
  resourceEntry.requestDuration = entry.responseStart - entry.requestStart
  resourceEntry.responseDuration = entry.responseEnd - entry.responseStart

  return resourceEntry
}

function isResourceEntry(entry: PerformanceEntry): entry is PerformanceResourceTiming {
  return entry.entryType === 'resource'
}

function isBrowserAgentRequest(url: string, configuration: Configuration) {
  return (
    url.startsWith(configuration.logsEndpoint) ||
    url.startsWith(configuration.rumEndpoint) ||
    (configuration.internalMonitoringEndpoint && url.startsWith(configuration.internalMonitoringEndpoint))
  )
}

export function trackFirstIdle(batch: RumBatch) {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(
      monitor(() => {
        window.cancelIdleCallback(handle)
        batch.add({
          data: {
            startTime: utils.getTimeSinceLoading(),
          },
          entryType: 'firstIdle',
        })
      })
    )
  }
}

function trackFirstInput(batch: RumBatch) {
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

    batch.add({
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

function trackInputDelay(batch: RumBatch) {
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
        batch.add({
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

function trackPageUnload(batch: RumBatch, currentData: Data) {
  batch.beforeFlushOnUnload(() => {
    const duration = utils.getTimeSinceLoading()
    // We want a throughput per minute to have meaningful data.
    const throughput = (currentData.xhrCount / duration) * 1000 * 60

    batch.add({
      data: {
        duration,
        errorCount: currentData.errorCount,
        throughput: utils.round(throughput, 1),
      },
      entryType: 'pageUnload',
    })
  })
}
