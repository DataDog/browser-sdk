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
  MessageObservable,
  MessageType,
  monitor,
  msToNs,
  Observable,
  RequestMessage,
  RequestType,
  ResourceKind,
  withSnakeCaseKeys,
} from '@browser-agent/core'
import lodashMerge from 'lodash.merge'

import { matchRequestTiming } from './matchRequestTiming'
import { pageViewId, PageViewPerformance, PageViewSummary, trackPageView } from './pageViewTracker'
import { startPerformanceCollection } from './performanceCollection'
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
  messageObservable: MessageObservable,
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

  const customEventObservable = new Observable<RawCustomEvent>()

  trackPageView(batch, window.location, addRumEvent, messageObservable, customEventObservable)
  trackErrors(messageObservable, addRumEvent)
  trackRequests(configuration, messageObservable, session, addRumEvent)
  trackPerformanceTiming(configuration, addRumEvent, messageObservable)
  trackCustomEvent(customEventObservable, addRumEvent)

  startPerformanceCollection(messageObservable, session)

  const globalApi: Partial<RumGlobal> = {}
  globalApi.setRumGlobalContext = monitor((context: Context) => {
    globalContext = context
  })
  globalApi.addRumGlobalContext = monitor((key: string, value: ContextValue) => {
    globalContext[key] = value
  })
  globalApi.addCustomEvent = monitor((name: string, context?: Context) => {
    customEventObservable.notify({ name, context })
  })
  return globalApi
}

function trackErrors(messageObservable: MessageObservable, addRumEvent: (event: RumEvent) => void) {
  messageObservable.subscribe((message) => {
    if (message.type === MessageType.error) {
      addRumEvent({
        evt: {
          category: RumEventCategory.ERROR,
        },
        message: message.message,
        rum: {
          errorCount: 1,
        },
        ...message.context,
      })
    }
  })
}

function trackCustomEvent(customEventObservable: Observable<RawCustomEvent>, addRumEvent: (event: RumEvent) => void) {
  customEventObservable.subscribe(({ name, context }) => {
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
  messageObservable: MessageObservable,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  if (!session.isTrackedWithResource()) {
    return
  }
  messageObservable.subscribe((message) => {
    if (message.type !== MessageType.request) {
      return
    }
    if (!isValidResource(message.url, configuration)) {
      return
    }
    const timing = matchRequestTiming(message)
    const kind = message.requestType === RequestType.XHR ? ResourceKind.XHR : ResourceKind.FETCH
    addRumEvent({
      duration: msToNs(timing ? timing.duration : message.duration),
      evt: {
        category: RumEventCategory.RESOURCE,
      },
      http: {
        method: message.method,
        performance: computePerformanceResourceDetails(timing),
        statusCode: message.status,
        url: message.url,
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
  addRumEvent: (event: RumEvent) => void,
  messageObservable: MessageObservable
) {
  messageObservable.subscribe((message) => {
    if (message.type === MessageType.performance) {
      const entry = message.entry
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
