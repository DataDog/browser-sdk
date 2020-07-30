import {
  Batch,
  combine,
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
  RequestType,
  ResourceKind,
  withSnakeCaseKeys,
} from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { matchRequestTiming } from './matchRequestTiming'
import { ActionContext, ParentContexts, startParentContexts, ViewContext } from './parentContexts'
import { RequestCompleteEvent } from './requestCollection'
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
import { startViewCollection, ViewLoadingType, ViewMeasures } from './viewCollection'

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

interface RumContext {
  applicationId: string
  date: number
  session: {
    type: string
  }
  view: {
    referrer: string
  }
}

export type RawRumEvent = RumErrorEvent | RumResourceEvent | RumViewEvent | RumLongTaskEvent | RumUserActionEvent
export type RumEvent =
  | RumErrorEvent & ActionContext & ViewContext & RumContext
  | RumResourceEvent & ActionContext & ViewContext & RumContext
  | RumViewEvent & ViewContext & RumContext
  | RumLongTaskEvent & ActionContext & ViewContext & RumContext
  | RumUserActionEvent & ViewContext & RumContext

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
): { globalApi: Omit<RumGlobal, 'init'>; stop: () => void } {
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

  const batch = makeRumBatch(configuration, lifeCycle)
  const handler = makeRumEventHandler(
    parentContexts,
    session,
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
    () => globalContext
  )

  trackRumEvents(configuration, lifeCycle, session, handler, batch)
  startViewCollection(location, lifeCycle)

  return {
    globalApi: {
      addRumGlobalContext: monitor((key: string, value: ContextValue) => {
        globalContext[key] = value
      }),
      addUserAction: monitor((name: string, context?: Context) => {
        lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, { context, name, type: UserActionType.CUSTOM })
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
    },
    stop: () => {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      batch.stop()
    },
  }
}

interface RumBatch {
  add: (message: Context) => void
  stop: () => void
  upsert: (message: Context, key: string) => void
}

function makeRumBatch(configuration: Configuration, lifeCycle: LifeCycle): RumBatch {
  const primaryBatch = createRumBatch(configuration.rumEndpoint)

  let replicaBatch: Batch | undefined
  const replica = configuration.replica
  if (replica !== undefined) {
    replicaBatch = createRumBatch(replica.rumEndpoint)
  }

  function createRumBatch(endpointUrl: string) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit, true),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout,
      () => lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    )
  }

  function withReplicaApplicationId(message: Context) {
    return deepMerge(message, { application_id: replica!.applicationId }) as Context
  }

  let stopped = false
  return {
    add: (message: Context) => {
      if (stopped) {
        return
      }
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(withReplicaApplicationId(message))
      }
    },
    stop: () => {
      stopped = true
    },
    upsert: (message: Context, key: string) => {
      if (stopped) {
        return
      }
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(withReplicaApplicationId(message), key)
      }
    },
  }
}

interface AssembleWithoutAction {
  view: ViewContext
  rum: RumContext
}

interface AssembleWithAction extends AssembleWithoutAction {
  action?: ActionContext
}

type RumEventHandler = <T extends RawRumEvent>(
  assemble: (event: T, { view, action, rum }: AssembleWithAction) => RumEvent,
  callback: (message: Context, event: RumEvent) => void
) => (startTime: number, event: T, customerContext?: Context) => void

function makeRumEventHandler(
  parentContexts: ParentContexts,
  session: RumSession,
  rumContextProvider: () => RumContext,
  globalContextProvider: () => Context
): RumEventHandler {
  return function rumEventHandler<T extends RawRumEvent>(
    assemble: (event: T, { view, action, rum }: AssembleWithAction) => RumEvent,
    callback: (message: Context, event: RumEvent) => void
  ) {
    return (startTime: number, event: T, customerContext?: Context) => {
      const view = parentContexts.findView(startTime)
      if (session.isTracked() && view && view.sessionId) {
        const action = parentContexts.findAction(startTime)
        const rumEvent = assemble(event, { action, view, rum: rumContextProvider() })
        const message = deepMerge(
          globalContextProvider(),
          customerContext,
          withSnakeCaseKeys(rumEvent as Context)
        ) as Context
        callback(message, rumEvent)
      }
    }
  }
}

interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_BROWSER?: unknown
}

function getSessionType() {
  return (window as BrowserWindow)._DATADOG_SYNTHETICS_BROWSER === undefined ? SessionType.USER : SessionType.SYNTHETICS
}

function trackRumEvents(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  handler: RumEventHandler,
  batch: RumBatch
) {
  const assembleWithoutAction = (event: RumViewEvent | RumUserActionEvent, { view, rum }: AssembleWithoutAction) =>
    combine(rum, view, event)
  const assembleWithAction = (
    event: RumErrorEvent | RumResourceEvent | RumLongTaskEvent,
    { view, action, rum }: AssembleWithAction
  ) => combine(rum, view, action, event)

  trackView(
    lifeCycle,
    handler(assembleWithoutAction, (message, event: RumEvent) => batch.upsert(message, event.view.id))
  )
  trackErrors(lifeCycle, handler(assembleWithAction, batch.add))
  trackRequests(configuration, lifeCycle, session, handler(assembleWithAction, batch.add))
  trackPerformanceTiming(configuration, lifeCycle, handler(assembleWithAction, batch.add))
  trackCustomUserAction(lifeCycle, handler(assembleWithoutAction, batch.add))
  trackAutoUserAction(lifeCycle, handler(assembleWithoutAction, batch.add))
}

function trackView(lifeCycle: LifeCycle, handler: (startTime: number, event: RumViewEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    handler(view.startTime, {
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
    })
  })
}

function trackErrors(lifeCycle: LifeCycle, handler: (startTime: number, event: RumErrorEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.ERROR_COLLECTED, ({ message, startTime, context }: ErrorMessage) => {
    handler(startTime, {
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
  handler: (startTime: number, event: RumUserActionEvent, customerContext?: Context) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, (userAction) => {
    handler(
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
  })
}

function trackAutoUserAction(lifeCycle: LifeCycle, handler: (startTime: number, event: RumUserActionEvent) => void) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (userAction) => {
    handler(userAction.startTime, {
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
  })
}

function trackRequests(
  configuration: Configuration,
  lifeCycle: LifeCycle,
  session: RumSession,
  handler: (startTime: number, event: RumResourceEvent) => void
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
    handler(startTime, {
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
  handler: (startTime: number, event: RumResourceEvent | RumLongTaskEvent) => void
) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    switch (entry.entryType) {
      case 'resource':
        handleResourceEntry(configuration, entry as PerformanceResourceTiming, handler, lifeCycle)
        break
      case 'longtask':
        handleLongTaskEntry(entry as PerformanceLongTaskTiming, handler)
        break
      default:
        break
    }
  })
}

export function handleResourceEntry(
  configuration: Configuration,
  entry: PerformanceResourceTiming,
  handler: (startTime: number, event: RumResourceEvent) => void,
  lifeCycle: LifeCycle
) {
  if (!isValidResource(entry.name, configuration)) {
    return
  }
  const resourceKind = computeResourceKind(entry)
  if (includes([ResourceKind.XHR, ResourceKind.FETCH], resourceKind)) {
    return
  }
  handler(entry.startTime, {
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

function handleLongTaskEntry(
  entry: PerformanceLongTaskTiming,
  handler: (startTime: number, event: RumLongTaskEvent) => void
) {
  handler(entry.startTime, {
    date: getTimestamp(entry.startTime),
    duration: msToNs(entry.duration),
    evt: {
      category: RumEventCategory.LONG_TASK,
    },
  })
}
