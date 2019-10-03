import lodashMerge from 'lodash.merge'

import { Configuration } from '../core/configuration'
import { ErrorContext, ErrorMessage, ErrorObservable, HttpContext } from '../core/errorCollection'
import { monitor } from '../core/internalMonitoring'
import { RequestDetails, RequestObservable, RequestType } from '../core/requestCollection'
import { Batch, HttpRequest } from '../core/transport'
import { Context, ContextValue, generateUUID, includes, msToNs, ResourceKind, withSnakeCaseKeys } from '../core/utils'
import { matchRequestTiming } from './matchRequestTiming'
import { computePerformanceResourceDetails, computeResourceKind, computeSize, isValidResource } from './resourceUtils'
import { RumGlobal } from './rum.entry'
import { RumSession } from './rumSession'

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
  PAGE_VIEW = 'page_view',
  RESOURCE = 'resource',
  SCREEN_PERFORMANCE = 'screen_performance',
}

interface PerformanceResourceDetailsElement {
  duration: number
  start: number
}

export interface PerformanceResourceDetails {
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
    method?: string
    statusCode?: number
    url: string
  }
  network: {
    bytesWritten?: number
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
  http?: HttpContext
  error: ErrorContext
  evt: {
    category: RumEventCategory.ERROR
  }
  message: string
  rum: {
    errorCount: number
  }
}

export interface RumPageViewEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.PAGE_VIEW
  }
  rum: {
    document_version: number
  }
}

export type RumEvent = RumErrorEvent | RumPerformanceScreenEvent | RumResourceEvent | RumPageViewEvent

export let pageViewId: string
let pageViewStartTimestamp: number
let pageViewStartOrigin: number
let pageViewVersion: number
let activeLocation: Location

export function startRum(
  applicationId: string,
  errorObservable: ErrorObservable,
  requestObservable: RequestObservable,
  configuration: Configuration,
  session: RumSession
) {
  let globalContext: Context = {}

  const batch = new Batch<RumEvent>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () =>
      lodashMerge(
        {
          applicationId,
          date: new Date().getTime(),
          screen: {
            id: pageViewId,
            url: window.location.href,
          },
          sessionId: session.getId(),
        },
        globalContext
      ),
    withSnakeCaseKeys
  )

  const addRumEvent = (event: RumEvent) => {
    if (session.isTracked()) {
      batch.add(event)
    }
  }

  trackPageView(batch, window.location, addRumEvent)
  trackErrors(errorObservable, addRumEvent)
  trackRequests(configuration, requestObservable, session, addRumEvent)
  trackPerformanceTiming(configuration, session, addRumEvent)

  const globalApi: Partial<RumGlobal> = {}
  globalApi.setRumGlobalContext = (context: Context) => {
    globalContext = context
  }
  globalApi.addRumGlobalContext = (key: string, value: ContextValue) => {
    globalContext[key] = value
  }
  return globalApi
}

export function trackPageView(batch: Batch<RumEvent>, location: Location, addRumEvent: (event: RumEvent) => void) {
  newPageView(location, addRumEvent)
  trackHistory(location, addRumEvent)
  batch.beforeFlushOnUnload(() => updatePageView(addRumEvent))
}

function newPageView(location: Location, addRumEvent: (event: RumEvent) => void) {
  pageViewId = generateUUID()
  pageViewStartTimestamp = new Date().getTime()
  pageViewStartOrigin = performance.now()
  pageViewVersion = 1
  activeLocation = { ...location }
  addPageViewEvent(addRumEvent)
}

function updatePageView(addRumEvent: (event: RumEvent) => void) {
  pageViewVersion += 1
  addPageViewEvent(addRumEvent)
}

function addPageViewEvent(addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    date: pageViewStartTimestamp,
    duration: msToNs(performance.now() - pageViewStartOrigin),
    evt: {
      category: RumEventCategory.PAGE_VIEW,
    },
    rum: {
      document_version: pageViewVersion,
    },
  })
}

function trackHistory(location: Location, addRumEvent: (event: RumEvent) => void) {
  const originalPushState = history.pushState
  history.pushState = monitor(function(this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onUrlChange(location, addRumEvent)
  })
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function(this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onUrlChange(location, addRumEvent)
  })
  window.addEventListener('popstate', () => {
    onUrlChange(location, addRumEvent)
  })
}

function onUrlChange(location: Location, addRumEvent: (event: RumEvent) => void) {
  if (areDifferentPages(activeLocation, location)) {
    updatePageView(addRumEvent)
    newPageView(location, addRumEvent)
  }
}

function areDifferentPages(previous: Location, current: Location) {
  return previous.pathname !== current.pathname
}

function trackErrors(errorObservable: ErrorObservable, addRumEvent: (event: RumEvent) => void) {
  errorObservable.subscribe(({ message, context }: ErrorMessage) => {
    addRumEvent({
      message,
      evt: {
        category: RumEventCategory.ERROR,
      },
      rum: {
        errorCount: 1,
      },
      ...context,
    })
  })
}

export function trackRequests(
  configuration: Configuration,
  requestObservable: RequestObservable,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  if (!session.isTrackedWithResource()) {
    return
  }
  requestObservable.subscribe((requestDetails: RequestDetails) => {
    if (!isValidResource(requestDetails.url, configuration)) {
      return
    }
    const timing = matchRequestTiming(requestDetails)
    const kind = requestDetails.type === RequestType.XHR ? ResourceKind.XHR : ResourceKind.FETCH
    addRumEvent({
      duration: msToNs(timing ? timing.duration : requestDetails.duration),
      evt: {
        category: RumEventCategory.RESOURCE,
      },
      http: {
        method: requestDetails.method,
        performance: computePerformanceResourceDetails(timing),
        statusCode: requestDetails.status,
        url: requestDetails.url,
      },
      network: {
        bytesWritten: computeSize(timing),
      },
      resource: {
        kind,
      },
      rum: {
        requestCount: 1,
      },
    })
  })
}

function trackPerformanceTiming(
  configuration: Configuration,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  if (window.performance && 'getEntriesByType' in performance) {
    handlePerformanceEntries(performance, session, configuration, addRumEvent)
  }
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(entries, session, configuration, addRumEvent))
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint'] })
    if (window.performance && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })
    }
  }
}

function handlePerformanceEntries(
  entries: Performance | PerformanceObserverEntryList,
  session: RumSession,
  configuration: Configuration,
  addRumEvent: (event: RumEvent) => void
) {
  if (session.isTrackedWithResource()) {
    entries
      .getEntriesByType('resource')
      .forEach((entry) => handleResourceEntry(configuration, entry as PerformanceResourceTiming, addRumEvent))
  }
  entries
    .getEntriesByType('navigation')
    .forEach(
      (entry) =>
        (entry as PerformanceNavigationTiming).loadEventEnd > 0 &&
        handleNavigationEntry(entry as PerformanceNavigationTiming, addRumEvent)
    )
  entries.getEntriesByType('paint').forEach((entry) => handlePaintEntry(entry as PerformancePaintTiming, addRumEvent))
}

export function handleResourceEntry(
  configuration: Configuration,
  entry: PerformanceResourceTiming,
  addRumEvent: (event: RumEvent) => void
) {
  if (!isValidResource(entry.name, configuration)) {
    return
  }
  const resourceKind = computeResourceKind(entry)
  if (includes([ResourceKind.XHR, ResourceKind.FETCH], resourceKind)) {
    return
  }
  addRumEvent({
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.RESOURCE,
    },
    http: {
      performance: computePerformanceResourceDetails(entry),
      url: entry.name,
    },
    network: {
      bytesWritten: computeSize(entry),
    },
    resource: {
      kind: resourceKind,
    },
  })
}

export function handleNavigationEntry(entry: PerformanceNavigationTiming, addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
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

export function handlePaintEntry(entry: PerformancePaintTiming, addRumEvent: (event: RumEvent) => void) {
  const performance = {
    [entry.name]: msToNs(entry.startTime),
  }
  addRumEvent({
    evt: {
      category: RumEventCategory.SCREEN_PERFORMANCE,
    },
    screen: {
      performance: performance as PerformanceScreenDetails,
    },
  })
}
