import {
  Batch,
  Configuration,
  Context,
  ContextValue,
  ErrorContext,
  ErrorMessage,
  HttpContext,
  HttpRequest,
  includes,
  monitor,
  msToNs,
  RequestDetails,
  RequestType,
  ResourceKind,
  withSnakeCaseKeys,
} from '@browser-agent/core'
import lodashMerge from 'lodash.merge'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { matchRequestTiming } from './matchRequestTiming'
import { pageViewId, PageViewPerformance, PageViewSummary, trackPageView } from './pageViewTracker'
import { computePerformanceResourceDetails, computeResourceKind, computeSize, isValidResource } from './resourceUtils'
import { RumGlobal } from './rum.entry'
import { RumSession } from './rumSession'

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

export type PerformanceLongTaskTiming = PerformanceEntry

export interface RawCustomEvent {
  name: string
  context?: Context
}

export enum RumEventCategory {
  CUSTOM = 'custom',
  ERROR = 'error',
  LONG_TASK = 'long_task',
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
    documentVersion: number
  }
  screen: {
    performance: PageViewPerformance
    summary: PageViewSummary
  }
}

export interface RumLongTaskEvent {
  duration: number
  evt: {
    category: RumEventCategory.LONG_TASK
  }
}

export interface RumCustomEvent {
  evt: {
    category: RumEventCategory.CUSTOM
    name: string
  }
  [key: string]: ContextValue
}

export type RumEvent =
  | RumErrorEvent
  | RumPerformanceScreenEvent
  | RumResourceEvent
  | RumPageViewEvent
  | RumLongTaskEvent
  | RumCustomEvent

export function startRum(
  applicationId: string,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession
): Omit<RumGlobal, 'init'> {
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
            referrer: document.referrer,
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

  trackPageView(batch, window.location, lifeCycle, addRumEvent)
  trackErrors(lifeCycle, addRumEvent)
  trackRequests(configuration, lifeCycle, session, addRumEvent)
  trackPerformanceTiming(configuration, lifeCycle, addRumEvent)
  trackCustomEvent(lifeCycle, addRumEvent)

  return {
    addCustomEvent: monitor((name: string, context?: Context) => {
      lifeCycle.notify(LifeCycleEventType.customEvent, { name, context })
    }),
    addRumGlobalContext: monitor((key: string, value: ContextValue) => {
      globalContext[key] = value
    }),
    getInternalContext: monitor(() => {
      return {
        application_id: applicationId,
        screen: {
          id: pageViewId,
        },
      }
    }),
    setRumGlobalContext: monitor((context: Context) => {
      globalContext = context
    }),
  }
}

function trackErrors(lifeCycle: LifeCycle, addRumEvent: (event: RumEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.error, ({ message, context }: ErrorMessage) => {
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

function trackCustomEvent(lifeCycle: LifeCycle, addRumEvent: (event: RumEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.customEvent, ({ name, context }) => {
    addRumEvent({
      ...context,
      evt: {
        name,
        category: RumEventCategory.CUSTOM,
      },
    })
  })
}

export function trackRequests(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  if (!session.isTrackedWithResource()) {
    return
  }
  lifeCycle.subscribe(LifeCycleEventType.request, (requestDetails: RequestDetails) => {
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
  lifeCycle: LifeCycle,
  addRumEvent: (event: RumEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.performance, (entry) => {
    switch (entry.entryType) {
      case 'resource':
        handleResourceEntry(configuration, entry as PerformanceResourceTiming, addRumEvent)
        break
      case 'navigation':
        handleNavigationEntry(entry as PerformanceNavigationTiming, addRumEvent)
        break
      case 'paint':
        handlePaintEntry(entry as PerformancePaintTiming, addRumEvent)
        break
      case 'longtask':
        handleLongTaskEntry(entry as PerformanceLongTaskTiming, addRumEvent)
        break
      default:
        break
    }
  })
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

export function handleLongTaskEntry(entry: PerformanceLongTaskTiming, addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.LONG_TASK,
    },
  })
}
