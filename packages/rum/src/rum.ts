import {
  Batch,
  Configuration,
  Context,
  ContextValue,
  deepMerge,
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

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { matchRequestTiming } from './matchRequestTiming'
import { ParentContexts, startParentContexts } from './parentContexts'
import {
  computePerformanceResourceDetails,
  computePerformanceResourceDuration,
  computeResourceKind,
  computeSize,
  isValidResource,
} from './resourceUtils'
import { InternalContext, RumGlobal } from './rum.entry'
import { RumSession } from './rumSession'
import { UserActionMeasures, UserActionType } from './userActionCollection'
import { ViewLoadingType, ViewMeasures } from './viewCollection'

export interface PerformancePaintTiming extends PerformanceEntry {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
  duration: 0
}

export type PerformanceLongTaskTiming = PerformanceEntry

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
}

export interface RumErrorEvent {
  date: number
  http?: HttpContext
  error: ErrorContext
  evt: {
    category: RumEventCategory.ERROR
  }
  message: string
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
    loadingTime?: number
    loadingType: ViewLoadingType
    measures: ViewMeasures
  }
}

export interface RumLongTaskEvent {
  date: number
  duration: number
  evt: {
    category: RumEventCategory.LONG_TASK
  }
}

export interface RumUserActionEvent {
  date?: number
  duration?: number
  evt: {
    category: RumEventCategory.USER_ACTION
    name: string
  }
  userAction: {
    id?: string
    type: UserActionType
    measures?: UserActionMeasures
  }
}

export type RumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumUserActionEvent

enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
}

export function startRum(
  applicationId: string,
  location: Location,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  internalMonitoring: InternalMonitoring
): Omit<RumGlobal, 'init'> {
  let globalContext: Context = {}

  const parentContexts = startParentContexts(window.location, lifeCycle, session)

  internalMonitoring.setExternalContextProvider(() => {
    return deepMerge(
      {
        application_id: applicationId,
      },
      parentContexts.findView(),
      globalContext
    ) as Context
  })

  const batch = startRumBatch(
    configuration,
    session,
    parentContexts,
    () => ({
      applicationId,
      date: new Date().getTime(),
      session: {
        // must be computed on each event because synthetics instrumentation can be done after sdk execution
        // cf https://github.com/puppeteer/puppeteer/issues/3667
        type: getSessionType(),
      },
      view: {
        referrer: document.referrer,
      },
    }),
    () => globalContext,
    () => lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
  )

  trackView(lifeCycle, batch.upsertRumEvent)
  trackErrors(lifeCycle, batch.addRumEventWithParentAction)
  trackRequests(configuration, lifeCycle, session, batch.addRumEventWithParentAction)
  trackPerformanceTiming(configuration, lifeCycle, batch.addRumEventWithParentAction)
  trackCustomUserAction(lifeCycle, batch.addRumEvent)
  trackAutoUserAction(lifeCycle, batch.addRumEvent)

  return {
    addRumGlobalContext: monitor((key: string, value: ContextValue) => {
      globalContext[key] = value
    }),
    addUserAction: monitor((name: string, context?: Context) => {
      lifeCycle.notify(LifeCycleEventType.ACTION_COMPLETED, { context, name, type: UserActionType.CUSTOM })
    }),
    getInternalContext: monitor(
      (startTime?: number): InternalContext => {
        return (withSnakeCaseKeys(deepMerge(
          { applicationId },
          parentContexts.findView(startTime),
          parentContexts.findAction(startTime)
        ) as Context) as unknown) as InternalContext
      }
    ),
    setRumGlobalContext: monitor((context: Context) => {
      globalContext = context
    }),
  }
}

function startRumBatch(
  configuration: Configuration,
  session: RumSession,
  parentContexts: ParentContexts,
  rumContextProvider: () => Context,
  globalContextProvider: () => Context,
  beforeUnloadCallback: () => void
) {
  const primaryBatch = createRumBatch(configuration.rumEndpoint)

  let replicaBatch: Batch<Context> | undefined
  const replica = configuration.replica
  if (replica !== undefined) {
    replicaBatch = createRumBatch(replica.rumEndpoint, () => ({
      application_id: replica.applicationId,
    }))
  }

  function createRumBatch(endpointUrl: string, extraContextProvider?: () => Context) {
    return new Batch<Context>(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit, true),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout,
      () => {
        const context = deepMerge(withSnakeCaseKeys(rumContextProvider()), globalContextProvider()) as Context
        if (!extraContextProvider) {
          return context
        }
        return {
          ...context,
          ...extraContextProvider(),
        }
      },
      beforeUnloadCallback
    )
  }

  function addRumEvent(startTime: number, event: RumEvent, context?: Context) {
    buildValidMessage({ startTime, event, context }, (message) => {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    })
  }

  function buildValidMessage(
    { startTime, event, context }: { startTime: number; event: RumEvent; context?: Context },
    callback: (message: Context) => void
  ) {
    const parentView = parentContexts.findView(startTime)
    if (session.isTracked() && parentView && parentView.sessionId) {
      const message = {
        ...context,
        ...withSnakeCaseKeys(deepMerge((event as unknown) as Context, parentView) as Context),
      }
      callback(message)
    }
  }

  return {
    addRumEvent,
    addRumEventWithParentAction: (startTime: number, event: RumEvent, context?: Context) => {
      const eventWithParentAction = { ...event, ...parentContexts.findAction(startTime) }
      addRumEvent(startTime, eventWithParentAction as RumEvent, context)
    },
    upsertRumEvent: (startTime: number, event: RumEvent, key: string) => {
      buildValidMessage({ startTime, event }, (message) => {
        primaryBatch.upsert(message, key)
        if (replicaBatch) {
          replicaBatch.upsert(message, key)
        }
      })
    },
  }
}

function trackView(
  lifeCycle: LifeCycle,
  upsertRumEvent: (startTime: number, event: RumViewEvent, key: string) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    upsertRumEvent(
      view.startTime,
      {
        date: getTimestamp(view.startTime),
        duration: msToNs(view.duration),
        evt: {
          category: RumEventCategory.VIEW,
        },
        rum: {
          documentVersion: view.documentVersion,
        },
        view: {
          loadingTime: view.loadingTime ? msToNs(view.loadingTime) : undefined,
          loadingType: view.loadingType,
          measures: view.measures,
        },
      },
      view.id
    )
  })
}

function trackErrors(lifeCycle: LifeCycle, addRumEvent: (startTime: number, event: RumErrorEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, ({ message, startTime, context }: ErrorMessage) => {
    addRumEvent(startTime, {
      message,
      date: getTimestamp(startTime),
      evt: {
        category: RumEventCategory.ERROR,
      },
      ...context,
    })
  })
}

function trackCustomUserAction(
  lifeCycle: LifeCycle,
  addRumEvent: (startTime: number, event: RumUserActionEvent, context?: Context) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, (userAction) => {
    if (userAction.type === UserActionType.CUSTOM) {
      addRumEvent(
        performance.now(),
        {
          evt: {
            category: RumEventCategory.USER_ACTION,
            name: userAction.name,
          },
          userAction: {
            type: userAction.type,
          },
        },
        userAction.context
      )
    }
  })
}

function trackAutoUserAction(
  lifeCycle: LifeCycle,
  addRumEvent: (startTime: number, event: RumUserActionEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, (userAction) => {
    if (userAction.type !== UserActionType.CUSTOM) {
      addRumEvent(userAction.startTime, {
        date: getTimestamp(userAction.startTime),
        duration: msToNs(userAction.duration),
        evt: {
          category: RumEventCategory.USER_ACTION,
          name: userAction.name,
        },
        userAction: {
          id: userAction.id,
          measures: userAction.measures,
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
  addRumEvent: (startTime: number, event: RumEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request: RequestCompleteEvent) => {
    if (!session.isTrackedWithResource()) {
      return
    }
    if (!isValidResource(request.url, configuration)) {
      return
    }
    const timing = matchRequestTiming(request)
    const kind = request.type === RequestType.XHR ? ResourceKind.XHR : ResourceKind.FETCH
    const startTime = timing ? timing.startTime : request.startTime
    addRumEvent(startTime, {
      date: getTimestamp(startTime),
      duration: timing ? computePerformanceResourceDuration(timing) : msToNs(request.duration),
      evt: {
        category: RumEventCategory.RESOURCE,
      },
      http: {
        method: request.method,
        performance: timing ? computePerformanceResourceDetails(timing) : undefined,
        statusCode: request.status,
        url: request.url,
      },
      network: {
        bytesWritten: timing ? computeSize(timing) : undefined,
      },
      resource: {
        kind,
      },
      traceId: request.traceId,
    })
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
  })
}

function trackPerformanceTiming(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  addRumEvent: (startTime: number, event: RumEvent) => void
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
  addRumEvent: (startTime: number, event: RumResourceEvent) => void,
  lifeCycle: LifeCycle
) {
  if (!isValidResource(entry.name, configuration)) {
    return
  }
  const resourceKind = computeResourceKind(entry)
  if (includes([ResourceKind.XHR, ResourceKind.FETCH], resourceKind)) {
    return
  }
  addRumEvent(entry.startTime, {
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
  })
  lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
}

export function handleLongTaskEntry(
  entry: PerformanceLongTaskTiming,
  addRumEvent: (startTime: number, event: RumLongTaskEvent) => void
) {
  addRumEvent(entry.startTime, {
    date: getTimestamp(entry.startTime),
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.LONG_TASK,
    },
  })
}

interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_BROWSER?: unknown
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}
