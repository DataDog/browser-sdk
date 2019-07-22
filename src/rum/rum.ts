import { Configuration } from '../core/configuration'
import { getCommonContext } from '../core/context'
import { ErrorObservable } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { Session } from '../core/session'
import { Batch, HttpRequest } from '../core/transport'
import { generateUUID, ResourceType, withSnakeCaseKeys } from '../core/utils'

declare global {
  interface Window {
    PerformanceObserver?: PerformanceObserver
  }
}

export interface EnhancedPerformanceResourceTiming extends PerformanceResourceTiming {
  connectDuration: number
  domainLookupDuration: number
  redirectDuration: number
  requestDuration: number
  responseDuration: number
  secureConnectionDuration: number
  resourceType: ResourceType
  requestCount?: number
}

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

type ObservedPerformanceTiming =
  | PerformanceNavigationTiming
  | PerformancePaintTiming
  | EnhancedPerformanceResourceTiming

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

export type RumPerformanceTiming = RumNavigationTiming | RumPaintTiming | RumResourceTiming

export interface RumError {
  errorCount: number
}

export type RumPageView = undefined

export type RumLocale = string

export type RumData = RumPerformanceTiming | RumError | RumPageView | RumLocale

export enum RumEventType {
  ERROR = 'error',
  NAVIGATION = 'navigation',
  PAGE_VIEW = 'page_view',
  RESOURCE = 'resource',
  PAINT = 'paint',
  LOCALE = 'locale',
}

export interface RumEvent {
  data?: RumData
  type: RumEventType
}

export type RumBatch = Batch<RumEvent>

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
  [ResourceType.XHR, (initiatorType: string) => 'xmlhttprequest' === initiatorType],
  [ResourceType.FETCH, (initiatorType: string) => 'fetch' === initiatorType],
  [ResourceType.BEACON, (initiatorType: string) => 'beacon' === initiatorType],
  [ResourceType.CSS, (_: string, path: string) => path.match(/\.css$/i) !== null],
  [ResourceType.JS, (_: string, path: string) => path.match(/\.js$/i) !== null],
  [
    ResourceType.IMAGE,
    (initiatorType: string, path: string) =>
      ['image', 'img', 'icon'].includes(initiatorType) || path.match(/\.(gif|jpg|jpeg|tiff|png|svg)$/i) !== null,
  ],
  [ResourceType.FONT, (_: string, path: string) => path.match(/\.(woff|eot|woff2|ttf)$/i) !== null],
  [
    ResourceType.MEDIA,
    (initiatorType: string, path: string) =>
      ['audio', 'video'].includes(initiatorType) || path.match(/\.(mp3|mp4)$/i) !== null,
  ],
]

let pageViewId: string
let activeLocation: Location

export function startRum(
  applicationId: string,
  errorObservable: ErrorObservable,
  configuration: Configuration,
  session: Session
) {
  const batch = initRumBatch(configuration, session, applicationId)

  trackLocale(batch)
  trackPageView(batch)
  trackHistory(batch)
  trackErrors(batch, errorObservable)
  trackPerformanceTiming(batch, configuration)
}

export function initRumBatch(configuration: Configuration, session: Session, applicationId: string) {
  return new Batch<RumEvent>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(session),
      applicationId,
      pageViewId,
    }),
    withSnakeCaseKeys
  )
}

export function trackLocale(batch: RumBatch) {
  if (window.navigator.languages) {
    batch.add({ type: RumEventType.LOCALE, data: window.navigator.languages.join(',') })
  } else {
    batch.add({ type: RumEventType.LOCALE, data: window.navigator.language })
  }
}

export function trackPageView(batch: RumBatch) {
  pageViewId = generateUUID()
  activeLocation = { ...window.location }
  batch.add({
    type: RumEventType.PAGE_VIEW,
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
      type: RumEventType.ERROR,
    })
  })
}

export function trackPerformanceTiming(batch: RumBatch, configuration: Configuration) {
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        list
          .getEntriesByType('resource')
          .forEach((entry) => handleResourceEntry(entry as PerformanceResourceTiming, batch, configuration))
        list
          .getEntriesByType('navigation')
          .forEach((entry) => handleNavigationEntry(entry as PerformanceNavigationTiming, batch))
        list.getEntriesByType('paint').forEach((entry) => handlePaintEntry(entry as PerformancePaintTiming, batch))

        // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
        window.performance.clearResourceTimings()
      })
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint'] })
  }
}

export function handleResourceEntry(timing: PerformanceResourceTiming, batch: RumBatch, configuration: Configuration) {
  const entry = timing as EnhancedPerformanceResourceTiming
  if (!isBrowserAgentRequest(entry.name, configuration)) {
    processTimingAttributes(entry)
    addResourceType(entry)
    if ([ResourceType.XHR, ResourceType.FETCH].includes(entry.resourceType)) {
      entry.requestCount = 1
    }
    batch.add(toResourceEvent(entry))
  }
}

function toResourceEvent(entry: EnhancedPerformanceResourceTiming) {
  return {
    data: {
      connectDuration: entry.connectDuration,
      domainLookupDuration: entry.domainLookupDuration,
      duration: entry.duration,
      encodedBodySize: entry.encodedBodySize,
      name: entry.name,
      redirectDuration: entry.redirectDuration,
      requestCount: entry.requestCount,
      requestDuration: entry.requestDuration,
      resourceType: entry.resourceType,
      responseDuration: entry.responseDuration,
      secureConnectionDuration: entry.secureConnectionDuration,
    },
    type: RumEventType.RESOURCE,
  }
}

function isBrowserAgentRequest(url: string, configuration: Configuration) {
  return (
    url.startsWith(configuration.logsEndpoint) ||
    url.startsWith(configuration.rumEndpoint) ||
    (configuration.internalMonitoringEndpoint && url.startsWith(configuration.internalMonitoringEndpoint))
  )
}

function processTimingAttributes(timing: EnhancedPerformanceResourceTiming) {
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

function addResourceType(timing: EnhancedPerformanceResourceTiming) {
  const path = new URL(timing.name).pathname
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(timing.initiatorType, path)) {
      timing.resourceType = type
      return
    }
  }
  timing.resourceType = ResourceType.OTHER
}

export function handleNavigationEntry(entry: PerformanceNavigationTiming, batch: RumBatch) {
  batch.add({
    data: {
      domComplete: entry.domComplete,
      domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
      domInteractive: entry.domInteractive,
      loadEventEnd: entry.loadEventEnd,
    },
    type: RumEventType.NAVIGATION,
  })
}

export function handlePaintEntry(entry: PerformancePaintTiming, batch: RumBatch) {
  batch.add({
    data: {
      [entry.name]: entry.startTime,
    },
    type: RumEventType.PAINT,
  })
}
