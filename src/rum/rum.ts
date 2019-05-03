import { Configuration } from '../core/configuration'
import { getCommonContext, getLoggerGlobalContext } from '../core/context'
import { monitor } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'
import * as utils from '../core/utils'
import { ErrorObservable } from '../logs/errorCollection'

type RequestIdleCallbackHandle = number

export interface Data {
  xhrDetails: XhrDetails
  errorCount: number
}

export interface XhrDetails {
  total: number
  resources: { [name: string]: number }
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

type ResourceType = 'request' | 'css' | 'js' | 'image' | 'font' | 'media' | 'other'

interface PerformanceResourceData extends PerformanceResourceTiming {
  connectionDuration: number
  domainLookupDuration: number
  redirectDuration: number
  requestDuration: number
  responseDuration: number
  secureConnectionDuration: number
  resourceType: ResourceType
}

const RESOURCE_TYPES: Array<[ResourceType, (initiatorType: string, path: string) => boolean]> = [
  ['request', (initiatorType: string) => ['xmlhttprequest', 'beacon', 'fetch', 'xhrDetails'].includes(initiatorType)],
  ['css', (_: string, path: string) => path.match(/\.css$/i) !== null],
  ['js', (_: string, path: string) => path.match(/\.js$/i) !== null],
  [
    'image',
    (initiatorType: string, path: string) =>
      ['image', 'img', 'icon'].includes(initiatorType) || path.match(/\.(gif|jpg|jpeg|tiff|png|svg)$/i) !== null,
  ],
  ['font', (_: string, path: string) => path.match(/\.(woff|eot|woff2|ttf)$/i) !== null],
  [
    'media',
    (initiatorType: string, path: string) =>
      ['audio', 'video'].includes(initiatorType) || path.match(/\.(mp3|mp4)$/i) !== null,
  ],
]

export function startRum(errorObservable: ErrorObservable, configuration: Configuration) {
  const batch = new Batch<RumMessage>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
      ...getLoggerGlobalContext(),
    })
  )
  const currentData: Data = { xhrDetails: { total: 0, resources: {} }, errorCount: 0 }

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

  const data = entry.toJSON()
  if (isResourceEntry(entry)) {
    if (isBrowserAgentRequest(entry.name, configuration)) {
      return
    }
    addTimingDurations(data)
    addResourceType(data)
    if (entry.initiatorType === 'xmlhttprequest') {
      computeXhrDetails(entry, currentData)
    }
  }

  batch.add({ data, entryType: entry.entryType as EntryType })
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

function addTimingDurations(entry: PerformanceResourceData) {
  entry.redirectDuration = entry.redirectEnd - entry.redirectStart
  entry.domainLookupDuration = entry.domainLookupEnd - entry.domainLookupStart
  entry.connectionDuration = entry.connectEnd - entry.connectStart
  entry.secureConnectionDuration = entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0
  entry.requestDuration = entry.responseStart - entry.requestStart
  entry.responseDuration = entry.responseEnd - entry.responseStart
}

function addResourceType(entry: PerformanceResourceData) {
  const path = new URL(entry.name).pathname
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(entry.initiatorType, path)) {
      entry.resourceType = type
      return
    }
  }
  entry.resourceType = 'other'
}

function computeXhrDetails(entry: PerformanceEntry, currentData: Data) {
  currentData.xhrDetails.total += 1
  if (!currentData.xhrDetails.resources[entry.name]) {
    currentData.xhrDetails.resources[entry.name] = 0
  }
  currentData.xhrDetails.resources[entry.name] += 1
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
    Object.keys(currentData.xhrDetails.resources).forEach((name) => {
      batch.add({
        data: {
          name,
          initiatorType: 'xhrDetails',
          throughput: toThroughput(currentData.xhrDetails.resources[name], duration),
        },
        entryType: 'resource',
      })
    })
    batch.add({
      data: {
        duration,
        errorCount: currentData.errorCount,
        totalThroughput: toThroughput(currentData.xhrDetails.total, duration),
      },
      entryType: 'pageUnload',
    })
  })
}

function toThroughput(requestCount: number, duration: number) {
  // We want a throughput per minute to have meaningful data.
  return utils.round((requestCount / duration) * 1000 * 60, 1)
}
