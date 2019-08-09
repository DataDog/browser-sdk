import { Configuration } from '../core/configuration'
import { getCommonContext } from '../core/context'
import { ErrorObservable } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { Session } from '../core/session'
import { Batch, HttpRequest } from '../core/transport'
import { generateUUID, msToNs, ResourceKind, withSnakeCaseKeys } from '../core/utils'

declare global {
  interface Window {
    PerformanceObserver?: PerformanceObserver
  }
}

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

export enum RumEventCategory {
  ERROR = 'error',
  SCREEN_PERFORMANCE = 'screen_performance',
  RESOURCE = 'resource',
}

interface PerformanceResourceDetailsElement {
  duration: number
  start: number
}

interface PerformanceResourceDetails {
  redirect?: PerformanceResourceDetailsElement
  dns: PerformanceResourceDetailsElement
  connect: PerformanceResourceDetailsElement
  ssl?: PerformanceResourceDetailsElement
  firstByte: PerformanceResourceDetailsElement
  download: PerformanceResourceDetailsElement
}

export interface RumResourceEvent {
  duration: number
  evt: {
    category: RumEventCategory.RESOURCE
  }
  http: {
    performance?: PerformanceResourceDetails
    url: string
  }
  network: {
    bytesWritten: number
  }
  resource: {
    kind: ResourceKind
  }
  rum?: {
    requestCount: number
  }
}

export interface RumPerformanceScreenEvent {
  evt: {
    category: RumEventCategory.SCREEN_PERFORMANCE
  }
  screen: {
    performance: PerformanceScreenDetails
  }
}

type PerformanceScreenDetails =
  | {
      domComplete: number
      domContentLoadedEventEnd: number
      domInteractive: number
      loadEventEnd: number
    }
  | {
      'first-paint': number
    }
  | {
      'first-contentful-paint': number
    }

export interface RumErrorEvent {
  evt: {
    category: RumEventCategory.ERROR
  }
  rum: {
    errorCount: number
  }
}

export type RumEvent = RumErrorEvent | RumPerformanceScreenEvent | RumResourceEvent

export type RumBatch = Batch<RumEvent>

const RESOURCE_TYPES: Array<[ResourceKind, (initiatorType: string, path: string) => boolean]> = [
  [ResourceKind.XHR, (initiatorType: string) => 'xmlhttprequest' === initiatorType],
  [ResourceKind.FETCH, (initiatorType: string) => 'fetch' === initiatorType],
  [ResourceKind.BEACON, (initiatorType: string) => 'beacon' === initiatorType],
  [ResourceKind.CSS, (_: string, path: string) => path.match(/\.css$/i) !== null],
  [ResourceKind.JS, (_: string, path: string) => path.match(/\.js$/i) !== null],
  [
    ResourceKind.IMAGE,
    (initiatorType: string, path: string) =>
      ['image', 'img', 'icon'].includes(initiatorType) || path.match(/\.(gif|jpg|jpeg|tiff|png|svg)$/i) !== null,
  ],
  [ResourceKind.FONT, (_: string, path: string) => path.match(/\.(woff|eot|woff2|ttf)$/i) !== null],
  [
    ResourceKind.MEDIA,
    (initiatorType: string, path: string) =>
      ['audio', 'video'].includes(initiatorType) || path.match(/\.(mp3|mp4)$/i) !== null,
  ],
]

export let pageViewId: string
let activeLocation: Location

export function startRum(
  applicationId: string,
  errorObservable: ErrorObservable,
  configuration: Configuration,
  session: Session
) {
  const batch = initRumBatch(configuration, session, applicationId)

  trackPageView(window.location)
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
      ...getCommonContext(),
      applicationId,
      pageViewId,
      screen: {
        id: pageViewId,
        url: window.location.href,
      },
      sessionId: session.getId(),
    }),
    withSnakeCaseKeys
  )
}

export function trackPageView(location: Location) {
  newPageView(location)
  trackHistory(location)
}

function newPageView(location: Location) {
  pageViewId = generateUUID()
  activeLocation = { ...location }
}

function trackHistory(location: Location) {
  const originalPushState = history.pushState
  history.pushState = function() {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location)
  }
  const originalReplaceState = history.replaceState
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location)
  }
  window.addEventListener('popstate', () => {
    onUrlChange(location)
  })
}

function onUrlChange(location: Location) {
  if (areDifferentPages(activeLocation, location)) {
    newPageView(location)
  }
}

function areDifferentPages(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackErrors(batch: RumBatch, errorObservable: ErrorObservable) {
  errorObservable.subscribe(() => {
    batch.add({
      evt: {
        category: RumEventCategory.ERROR,
      },
      rum: {
        errorCount: 1,
      },
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

export function handleResourceEntry(entry: PerformanceResourceTiming, batch: RumBatch, configuration: Configuration) {
  if (!isBrowserAgentRequest(entry.name, configuration)) {
    const resourceKind = computeResourceKind(entry)
    const isRequest = [ResourceKind.XHR, ResourceKind.FETCH].includes(resourceKind)
    batch.add({
      duration: msToNs(entry.duration),
      evt: {
        category: RumEventCategory.RESOURCE,
      },
      http: {
        performance: computePerformanceResourceDetails(entry),
        url: entry.name,
      },
      network: {
        bytesWritten: entry.decodedBodySize,
      },
      resource: {
        kind: resourceKind,
      },
      rum: isRequest
        ? {
            requestCount: 1,
          }
        : undefined,
    })
  }
}

function isBrowserAgentRequest(url: string, configuration: Configuration) {
  return (
    url.startsWith(configuration.logsEndpoint) ||
    url.startsWith(configuration.rumEndpoint) ||
    (configuration.internalMonitoringEndpoint && url.startsWith(configuration.internalMonitoringEndpoint))
  )
}

function computePerformanceResourceDetails(entry: PerformanceResourceTiming): PerformanceResourceDetails | undefined {
  if (hasTimingAllowedAttributes(entry)) {
    return {
      connect: { duration: msToNs(entry.connectEnd - entry.connectStart), start: msToNs(entry.connectStart) },
      dns: {
        duration: msToNs(entry.domainLookupEnd - entry.domainLookupStart),
        start: msToNs(entry.domainLookupStart),
      },
      download: { duration: msToNs(entry.responseEnd - entry.responseStart), start: msToNs(entry.responseStart) },
      firstByte: { duration: msToNs(entry.responseStart - entry.requestStart), start: msToNs(entry.requestStart) },
      redirect:
        entry.redirectStart > 0
          ? { duration: msToNs(entry.redirectEnd - entry.redirectStart), start: msToNs(entry.redirectStart) }
          : undefined,
      ssl:
        entry.secureConnectionStart > 0
          ? {
              duration: msToNs(entry.connectEnd - entry.secureConnectionStart),
              start: msToNs(entry.secureConnectionStart),
            }
          : undefined,
    }
  }
  return undefined
}

function hasTimingAllowedAttributes(timing: PerformanceResourceTiming) {
  return timing.responseStart > 0
}

function computeResourceKind(timing: PerformanceResourceTiming) {
  const path = new URL(timing.name).pathname
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(timing.initiatorType, path)) {
      return type
    }
  }
  return ResourceKind.OTHER
}

export function handleNavigationEntry(entry: PerformanceNavigationTiming, batch: RumBatch) {
  batch.add({
    evt: {
      category: RumEventCategory.SCREEN_PERFORMANCE,
    },
    screen: {
      performance: {
        domComplete: msToNs(entry.domComplete),
        domContentLoadedEventEnd: msToNs(entry.domContentLoadedEventEnd),
        domInteractive: msToNs(entry.domInteractive),
        loadEventEnd: msToNs(entry.loadEventEnd),
      },
    },
  })
}

export function handlePaintEntry(entry: PerformancePaintTiming, batch: RumBatch) {
  const performance = {
    [entry.name]: msToNs(entry.startTime),
  }
  batch.add({
    evt: {
      category: RumEventCategory.SCREEN_PERFORMANCE,
    },
    screen: {
      performance: performance as PerformanceScreenDetails,
    },
  })
}
