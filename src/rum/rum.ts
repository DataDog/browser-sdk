import { Configuration } from '../core/configuration'
import { getCommonContext } from '../core/context'
import { ErrorMessage, ErrorObservable } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'
import * as utils from '../core/utils'

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

export interface RumMessage {
  data?: any
  entryType: EntryType
}

export type RumBatch = Batch<RumMessage>

type EntryType = 'error' | 'navigation' | 'page_view' | 'paint' | 'resource'

type ResourceType = 'xhr' | 'beacon' | 'fetch' | 'css' | 'js' | 'image' | 'font' | 'media' | 'other'

// cf https://www.w3.org/TR/resource-timing-2/#sec-cross-origin-resources
const TIMING_ALLOWED_ATTRIBUTES: Array<keyof PerformanceResourceTiming> = [
  'redirectStart',
  'redirectEnd',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'connectEnd',
  'requestStart',
  'responseStart',
  'secureConnectionStart',
  'transferSize',
  'encodedBodySize',
  'decodedBodySize',
]

interface PerformanceResourceData extends PerformanceResourceTiming {
  connectDuration: number
  domainLookupDuration: number
  redirectDuration: number
  requestDuration: number
  responseDuration: number
  secureConnectionDuration: number
  resourceType: ResourceType
  requestCount?: number
}

const RESOURCE_TYPES: Array<[ResourceType, (initiatorType: string, path: string) => boolean]> = [
  ['xhr', (initiatorType: string) => 'xmlhttprequest' === initiatorType],
  ['fetch', (initiatorType: string) => 'fetch' === initiatorType],
  ['beacon', (initiatorType: string) => 'beacon' === initiatorType],
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

let pageViewId: string
let activeLocation: Location

export function startRum(rumProjectId: string, errorObservable: ErrorObservable, configuration: Configuration) {
  const batch = initRumBatch(configuration, rumProjectId)

  trackPageView(batch)
  trackHistory(batch)
  trackErrors(batch, errorObservable)
  trackPerformanceTiming(batch, configuration)
}

export function initRumBatch(configuration: Configuration, rumProjectId: string) {
  return new Batch<RumMessage>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
      pageViewId,
      rumProjectId,
    }),
    utils.withSnakeCaseKeys
  )
}

export function trackPageView(batch: RumBatch) {
  pageViewId = utils.generateUUID()
  activeLocation = { ...window.location }
  batch.add({
    entryType: 'page_view',
  })
}

function trackHistory(batch: RumBatch) {
  const originalPushState = history.pushState
  history.pushState = function() {
    originalPushState.apply(this, arguments as any)
    onUrlChange(batch)
  }
  const originalReplaceState = history.replaceState
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(batch)
  }
  window.addEventListener('popstate', () => {
    onUrlChange(batch)
  })
}

function onUrlChange(batch: RumBatch) {
  if (areDifferentPages(activeLocation, window.location)) {
    trackPageView(batch)
  }
}

function areDifferentPages(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackErrors(batch: RumBatch, errorObservable: ErrorObservable) {
  errorObservable.subscribe((data: ErrorMessage) => {
    batch.add({
      data: {
        ...data,
        errorCount: 1,
      },
      entryType: 'error',
    })
  })
}

export function trackPerformanceTiming(batch: RumBatch, configuration: Configuration) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        list.getEntries().forEach((entry: PerformanceEntry) => handlePerformanceEntry(entry, batch, configuration))
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })
  }
}

export function handlePerformanceEntry(entry: PerformanceEntry, batch: RumBatch, configuration: Configuration) {
  const entryType = entry.entryType as EntryType
  if (entryType === 'paint') {
    batch.add({ entryType, data: { [entry.name]: entry.startTime } })
    return
  }

  const data = entry.toJSON() as PerformanceResourceData
  if (isResourceEntry(entry)) {
    if (isBrowserAgentRequest(entry.name, configuration)) {
      return
    }
    processTimingAttributes(data)
    addResourceType(data)
    if (['xhr', 'fetch'].includes(data.resourceType)) {
      data.requestCount = 1
    }
  }

  batch.add({ data, entryType })
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

function processTimingAttributes(data: PerformanceResourceData) {
  if (hasTimingAllowedAttributes(data)) {
    data.domainLookupDuration = data.domainLookupEnd - data.domainLookupStart
    data.connectDuration = data.connectEnd - data.connectStart
    data.requestDuration = data.responseStart - data.requestStart
    data.responseDuration = data.responseEnd - data.responseStart
    if (data.redirectStart > 0) {
      data.redirectDuration = data.redirectEnd - data.redirectStart
    }
    if (data.secureConnectionStart > 0) {
      data.secureConnectionDuration = data.connectEnd - data.secureConnectionStart
    }
  } else {
    TIMING_ALLOWED_ATTRIBUTES.forEach((attribute: keyof PerformanceResourceTiming) => delete data[attribute])
  }
}

function hasTimingAllowedAttributes(entry: PerformanceResourceData) {
  return entry.responseStart > 0
}

function addResourceType(data: PerformanceResourceData) {
  const path = new URL(data.name).pathname
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(data.initiatorType, path)) {
      data.resourceType = type
      return
    }
  }
  data.resourceType = 'other'
}
