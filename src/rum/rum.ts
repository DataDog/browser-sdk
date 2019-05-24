import { Configuration } from '../core/configuration'
import { getCommonContext } from '../core/context'
import { ErrorObservable } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { Batch, HttpRequest } from '../core/transport'
import * as utils from '../core/utils'

declare global {
  interface PerformanceResourceTiming {
    connectDuration: number
    domainLookupDuration: number
    redirectDuration: number
    requestDuration: number
    responseDuration: number
    secureConnectionDuration: number
    resourceType: ResourceType
    requestCount?: number
  }
}

interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

type ObservedPerformanceTiming = PerformanceNavigationTiming | PerformancePaintTiming | PerformanceResourceTiming

export interface RumNavigationTiming {
  domComplete: number
  domContentLoadedEventEnd: number
  domInteractive: number
  loadEventEnd: number
}

export interface RumPaintTiming {
  'first-paint'?: number
  'first-contentful-paint'?: number
}

export interface RumResourceTiming {
  connectDuration: number
  domainLookupDuration: number
  duration: number
  encodedBodySize: number
  name: string
  redirectDuration?: number
  requestCount?: number
  requestDuration: number
  resourceType: ResourceType
  responseDuration: number
  secureConnectionDuration?: number
}

type ResourceType = 'xhr' | 'beacon' | 'fetch' | 'css' | 'js' | 'image' | 'font' | 'media' | 'other'

export type RumPerformanceTiming = RumNavigationTiming | RumPaintTiming | RumResourceTiming

export interface RumError {
  errorCount: number
}

export type RumPageView = undefined

export type RumData = RumPerformanceTiming | RumError | RumPageView

export type RumEventType = 'error' | 'navigation' | 'page_view' | 'resource' | 'paint'

export interface RumMessage {
  data: RumData
  type: RumEventType
}

export type RumBatch = Batch<RumMessage>

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
    data: undefined,
    type: 'page_view',
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
  errorObservable.subscribe(() => {
    batch.add({
      data: {
        errorCount: 1,
      },
      type: 'error',
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
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint'] })
  }
}

export function handlePerformanceEntry(entry: PerformanceEntry, batch: RumBatch, configuration: Configuration) {
  const entryType = entry.entryType as RumEventType
  const timing = entry.toJSON() as ObservedPerformanceTiming
  if (isBlacklistedTiming(timing, configuration)) {
    return
  }
  addExtraFields(timing)
  batch.add({ type: entryType, data: toRumTiming(timing) })
}

function isBlacklistedTiming(timing: ObservedPerformanceTiming, configuration: Configuration) {
  return isResourceTiming(timing) && isBrowserAgentRequest(timing.name, configuration)
}

function isResourceTiming(timing: ObservedPerformanceTiming): timing is PerformanceResourceTiming {
  return timing.entryType === 'resource'
}

function isNavigationTiming(timing: ObservedPerformanceTiming): timing is PerformanceNavigationTiming {
  return timing.entryType === 'navigation'
}

function isBrowserAgentRequest(url: string, configuration: Configuration) {
  return (
    url.startsWith(configuration.logsEndpoint) ||
    url.startsWith(configuration.rumEndpoint) ||
    (configuration.internalMonitoringEndpoint && url.startsWith(configuration.internalMonitoringEndpoint))
  )
}

function addExtraFields(timing: ObservedPerformanceTiming) {
  if (isResourceTiming(timing)) {
    processTimingAttributes(timing)
    addResourceType(timing)
    if (['xhr', 'fetch'].includes(timing.resourceType)) {
      timing.requestCount = 1
    }
  }
  return timing
}

function processTimingAttributes(timing: PerformanceResourceTiming) {
  if (hasTimingAllowedAttributes(timing)) {
    timing.domainLookupDuration = timing.domainLookupEnd - timing.domainLookupStart
    timing.connectDuration = timing.connectEnd - timing.connectStart
    timing.requestDuration = timing.responseStart - timing.requestStart
    timing.responseDuration = timing.responseEnd - timing.responseStart
    if (timing.redirectStart > 0) {
      timing.redirectDuration = timing.redirectEnd - timing.redirectStart
    }
    if (timing.secureConnectionStart > 0) {
      timing.secureConnectionDuration = timing.connectEnd - timing.secureConnectionStart
    }
  } else {
    TIMING_ALLOWED_ATTRIBUTES.forEach((attribute: keyof PerformanceResourceTiming) => delete timing[attribute])
  }
}

function hasTimingAllowedAttributes(timing: PerformanceResourceTiming) {
  return timing.responseStart > 0
}

function addResourceType(timing: PerformanceResourceTiming) {
  const path = new URL(timing.name).pathname
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(timing.initiatorType, path)) {
      timing.resourceType = type
      return
    }
  }
  timing.resourceType = 'other'
}

function toRumTiming(timing: ObservedPerformanceTiming): RumPerformanceTiming {
  if (isNavigationTiming(timing)) {
    return {
      domComplete: timing.domComplete,
      domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
      domInteractive: timing.domInteractive,
      loadEventEnd: timing.loadEventEnd,
    }
  }
  if (isResourceTiming(timing)) {
    return {
      connectDuration: timing.connectDuration,
      domainLookupDuration: timing.domainLookupDuration,
      duration: timing.duration,
      encodedBodySize: timing.encodedBodySize,
      name: timing.name,
      redirectDuration: timing.redirectDuration,
      requestCount: timing.requestCount,
      requestDuration: timing.requestDuration,
      resourceType: timing.resourceType,
      responseDuration: timing.responseDuration,
      secureConnectionDuration: timing.secureConnectionDuration,
    }
  }
  return {
    [timing.name]: timing.startTime,
  }
}
