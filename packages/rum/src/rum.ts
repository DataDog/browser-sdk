import {
  Batch,
  Configuration,
  Context,
  ContextValue,
  ErrorContext,
  ErrorMessage,
  getTimestamp,
  HttpContext,
  HttpRequest,
  includes,
  InternalMonitoring,
  monitor,
  msToNs,
  Omit,
  RequestCompleteEvent,
  RequestType,
  ResourceKind,
  withSnakeCaseKeys,
} from '@datadog/browser-core'
import lodashMerge from 'lodash.merge'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { matchRequestTiming } from './matchRequestTiming'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isValidResource,
} from './resourceUtils'
import { RumGlobal } from './rum.entry'
import { RumSession } from './rumSession'
import { getUserActionId } from './userActionCollection'
import { trackView, viewContext, ViewMeasures } from './viewTracker'

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

export type PerformanceLongTaskTiming = PerformanceEntry

export enum UserActionType {
  CLICK = 'click',
  LOAD_VIEW = 'load_view',
  CUSTOM = 'custom',
}

interface CustomUserAction {
  type: UserActionType.CUSTOM
  name: string
  context?: Context
}

interface AutoUserAction {
  type: UserActionType.LOAD_VIEW | UserActionType.CLICK
  id: string
  name: string
  startTime: number
  duration: number
}

export type UserAction = CustomUserAction | AutoUserAction

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
  dns?: PerformanceResourceDetailsElement
  connect?: PerformanceResourceDetailsElement
  ssl?: PerformanceResourceDetailsElement
  firstByte: PerformanceResourceDetailsElement
  download: PerformanceResourceDetailsElement
}

export interface RumResourceEvent {
  date: number
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
  traceId?: number
  userActionId?: string
}

export interface RumErrorEvent {
  http?: HttpContext
  error: ErrorContext
  evt: {
    category: RumEventCategory.ERROR
  }
  message: string
  userActionId?: string
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
  userActionId?: string
}

export interface RumUserActionEvent {
  evt: {
    category: RumEventCategory.USER_ACTION
    name: string
  }
  userAction: {
    id?: string
    type: UserActionType
  }
  [key: string]: ContextValue
}

export type RumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumUserActionEvent

export function startRum(
  applicationId: string,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  internalMonitoring: InternalMonitoring
): Omit<RumGlobal, 'init'> {
  let globalContext: Context = {}

  internalMonitoring.setExternalContextProvider(() =>
    lodashMerge(
      {
        application_id: applicationId,
        session_id: viewContext.sessionId,
        view: {
          id: viewContext.id,
        },
      },
      globalContext
    )
  )

  const batch = startRumBatch(
    configuration,
    session,
    () => ({
      applicationId,
      date: new Date().getTime(),
      sessionId: viewContext.sessionId,
      view: {
        id: viewContext.id,
        referrer: document.referrer,
        url: viewContext.location.href,
      },
    }),
    () => globalContext
  )

  trackView(window.location, lifeCycle, session, batch.upsertRumEvent, batch.beforeFlushOnUnload)
  trackErrors(lifeCycle, batch.addRumEvent)
  trackRequests(configuration, lifeCycle, session, batch.addRumEvent)
  trackPerformanceTiming(configuration, lifeCycle, batch.addRumEvent)
  trackUserAction(lifeCycle, batch.addUserEvent, batch.addRumEvent)

  return {
    addRumGlobalContext: monitor((key: string, value: ContextValue) => {
      globalContext[key] = value
    }),
    addUserAction: monitor((name: string, context?: Context) => {
      lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, { context, name, type: UserActionType.CUSTOM })
    }),
    getInternalContext: monitor(() => {
      return {
        application_id: applicationId,
        session_id: viewContext.sessionId,
        view: {
          id: viewContext.id,
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
    new HttpRequest(configuration.rumEndpoint, configuration.batchBytesLimit, true),
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
    addUserEvent: (event: RumUserActionEvent) => {
      if (session.isTracked()) {
        batch.add(event as Context)
      }
    },
    beforeFlushOnUnload: (handler: () => void) => batch.beforeFlushOnUnload(handler),
    upsertRumEvent: (event: RumEvent, key: string) => {
      if (session.isTracked()) {
        batch.upsert(withSnakeCaseKeys(event as Context), key)
      }
    },
  }
}

function trackErrors(lifeCycle: LifeCycle, addRumEvent: (event: RumEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, ({ message, startTime, context }: ErrorMessage) => {
    addRumEvent({
      message,
      date: getTimestamp(startTime),
      evt: {
        category: RumEventCategory.ERROR,
      },
      userActionId: getUserActionId(startTime),
      ...context,
    })
  })
}

function trackUserAction(
  lifeCycle: LifeCycle,
  addUserEvent: (event: RumUserActionEvent) => void,
  addRumEvent: (event: RumUserActionEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, (userAction) => {
    if (userAction.type === UserActionType.CUSTOM) {
      addUserEvent({
        ...userAction.context,
        evt: {
          category: RumEventCategory.USER_ACTION,
          name: userAction.name,
        },
        userAction: {
          type: userAction.type,
        },
      })
    } else {
      addRumEvent({
        date: getTimestamp(userAction.startTime),
        duration: userAction.duration,
        evt: {
          category: RumEventCategory.USER_ACTION,
          name: userAction.name,
        },
        userAction: {
          id: userAction.id,
          type: userAction.type,
        },
      })
    }
  })
}

export function trackRequests(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  addRumEvent: (event: RumEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (completeEvent: RequestCompleteEvent) => {
    if (!session.isTrackedWithResource()) {
      return
    }
    if (!isValidResource(completeEvent.url, configuration)) {
      return
    }
    const timing = matchRequestTiming(completeEvent)
    const kind = completeEvent.type === RequestType.XHR ? ResourceKind.XHR : ResourceKind.FETCH
    const startTime = timing ? timing.startTime : completeEvent.startTime
    addRumEvent({
      date: getTimestamp(startTime),
      duration: timing ? computePerformanceResourceDuration(timing) : msToNs(completeEvent.duration),
      evt: {
        category: RumEventCategory.RESOURCE,
      },
      http: {
        method: completeEvent.method,
        performance: timing ? computePerformanceResourceDetails(timing) : undefined,
        statusCode: completeEvent.status,
        url: completeEvent.url,
      },
      network: {
        bytesWritten: timing ? computeSize(timing) : undefined,
      },
      resource: {
        kind,
      },
      traceId: completeEvent.traceId,
      userActionId: getUserActionId(startTime),
    })
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
  })
}

function trackPerformanceTiming(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  addRumEvent: (event: RumEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    switch (entry.entryType) {
      case 'resource':
        handleResourceEntry(configuration, entry as PerformanceResourceTiming, addRumEvent, lifeCycle)
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
  addRumEvent: (event: RumResourceEvent) => void,
  lifeCycle: LifeCycle
) {
  if (!isValidResource(entry.name, configuration)) {
    return
  }
  const resourceKind = computeResourceKind(entry)
  if (includes([ResourceKind.XHR, ResourceKind.FETCH], resourceKind)) {
    return
  }
  addRumEvent({
    date: getTimestamp(entry.startTime),
    duration: computePerformanceResourceDuration(entry),
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
    userActionId: getUserActionId(entry.startTime),
  })
  lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
}

export function handleLongTaskEntry(entry: PerformanceLongTaskTiming, addRumEvent: (event: RumEvent) => void) {
  addRumEvent({
    date: getTimestamp(entry.startTime),
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.LONG_TASK,
    },
    startTime: entry.startTime,
    userActionId: getUserActionId(entry.startTime),
  })
}
