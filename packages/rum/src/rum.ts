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
} from '@browser-sdk/core'
import lodashMerge from 'lodash.merge'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { matchRequestTiming } from './matchRequestTiming'
import { computePerformanceResourceDetails, computeResourceKind, computeSize, isValidResource } from './resourceUtils'
import { RumGlobal } from './rum.entry'
import { RumSession } from './rumSession'
import { trackView, viewId, viewLocation, ViewMeasures } from './viewTracker'

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

export type PerformanceLongTaskTiming = PerformanceEntry

export interface UserAction {
  name: string
  context?: Context
}

export enum RumEventCategory {
  USER_ACTION = 'user_action',
  ERROR = 'error',
  LONG_TASK = 'long_task',
  VIEW = 'view',
  RESOURCE = 'resource',
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
  traceId?: number
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

export interface RumViewEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.VIEW
  }
  rum: {
    documentVersion: number
  }
  view: {
    measures: ViewMeasures
  }
}

export interface RumLongTaskEvent {
  duration: number
  evt: {
    category: RumEventCategory.LONG_TASK
  }
}

export interface RumUserAction {
  evt: {
    category: RumEventCategory.USER_ACTION
    name: string
  }
  [key: string]: ContextValue
}

export type RumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumUserAction

export function startRum(
  applicationId: string,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession
): Omit<RumGlobal, 'init'> {
  let globalContext: Context = {}

  const batch = startRumBatch(
    configuration,
    session,
    () => ({
      applicationId,
      date: new Date().getTime(),
      screen: {
        // needed for retro compatibility
        id: viewId,
        url: viewLocation.href,
      },
      sessionId: session.getId(),
      view: {
        id: viewId,
        referrer: document.referrer,
        url: viewLocation.href,
      },
    }),
    () => globalContext
  )

  trackView(window.location, lifeCycle, batch.addRumEvent, batch.beforeFlushOnUnload)
  trackErrors(lifeCycle, batch.addRumEvent)
  trackRequests(configuration, lifeCycle, session, batch.addRumEvent)
  trackPerformanceTiming(configuration, lifeCycle, batch.addRumEvent)
  trackUserAction(lifeCycle, batch.addUserEvent)

  return {
    addRumGlobalContext: monitor((key: string, value: ContextValue) => {
      globalContext[key] = value
    }),
    addUserAction: monitor((name: string, context?: Context) => {
      lifeCycle.notify(LifeCycleEventType.userAction, { name, context })
    }),
    getInternalContext: monitor(() => {
      return {
        application_id: applicationId,
        session_id: session.getId(),
        view: {
          id: viewId,
        },
      }
    }),
    setRumGlobalContext: monitor((context: Context) => {
      globalContext = context
    }),
  }
}

function startRumBatch(
  configuration: Configuration,
  session: RumSession,
  rumContextProvider: () => Context,
  globalContextProvider: () => Context
) {
  const batch = new Batch<Context>(
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => lodashMerge(withSnakeCaseKeys(rumContextProvider()), globalContextProvider())
  )
  return {
    addRumEvent: (event: RumEvent) => {
      if (session.isTracked()) {
        batch.add(withSnakeCaseKeys(event as Context))
      }
    },
    addUserEvent: (event: RumUserAction) => {
      if (session.isTracked()) {
        batch.add(event as Context)
      }
    },
    beforeFlushOnUnload: (handler: () => void) => batch.beforeFlushOnUnload(handler),
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

function trackUserAction(lifeCycle: LifeCycle, addUserEvent: (event: RumUserAction) => void) {
  lifeCycle.subscribe(LifeCycleEventType.userAction, ({ name, context }) => {
    addUserEvent({
      ...context,
      evt: {
        name,
        category: RumEventCategory.USER_ACTION,
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
  lifeCycle.subscribe(LifeCycleEventType.request, (requestDetails: RequestDetails) => {
    if (!session.isTrackedWithResource()) {
      return
    }
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
      traceId: requestDetails.traceId,
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

export function handleLongTaskEntry(entry: PerformanceLongTaskTiming, addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.LONG_TASK,
    },
  })
}
