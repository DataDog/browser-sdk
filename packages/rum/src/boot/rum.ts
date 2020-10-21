import {
  combine,
  commonInit,
  Configuration,
  Context,
  ErrorMessage,
  getTimestamp,
  msToNs,
  withSnakeCaseKeys,
} from '@datadog/browser-core'
import { startDOMMutationCollection } from '../browser/domMutationCollection'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startRumAssemblyV2 } from '../domain/assemblyV2'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { ParentContexts, startParentContexts } from '../domain/parentContexts'
import { startRequestCollection } from '../domain/requestCollection'
import { startLongTaskCollection } from '../domain/rumEventsCollection/longTask/longTaskCollection'
import { startResourceCollection } from '../domain/rumEventsCollection/resource/resourceCollection'
import { CustomUserAction, startUserActionCollection } from '../domain/rumEventsCollection/userActionCollection'
import { startViewCollection } from '../domain/rumEventsCollection/viewCollection'
import { RumSession, startRumSession } from '../domain/rumSession'
import { startRumBatch } from '../transport/batch'
import {
  InternalContext,
  RawRumEvent,
  RumErrorEvent,
  RumEventCategory,
  RumUserActionEvent,
  RumViewEvent,
} from '../types'

import { buildEnv } from './buildEnv'
import { RumUserConfiguration } from './rum.entry'

export function startRum(userConfiguration: RumUserConfiguration, getGlobalContext: () => Context) {
  const lifeCycle = new LifeCycle()

  const isCollectingError = true
  const { errorObservable, configuration, internalMonitoring } = commonInit(
    userConfiguration,
    buildEnv,
    isCollectingError
  )
  const session = startRumSession(configuration, lifeCycle)

  internalMonitoring.setExternalContextProvider(() => {
    return combine(
      {
        application_id: userConfiguration.applicationId,
      },
      parentContexts.findView(),
      getGlobalContext()
    )
  })

  const { parentContexts } = startRumEventCollection(
    userConfiguration.applicationId,
    location,
    lifeCycle,
    configuration,
    session,
    getGlobalContext
  )

  startRequestCollection(lifeCycle, configuration)
  startPerformanceCollection(lifeCycle, configuration)
  startDOMMutationCollection(lifeCycle)
  if (configuration.trackInteractions) {
    startUserActionCollection(lifeCycle)
  }

  errorObservable.subscribe((errorMessage) => lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, errorMessage))

  return {
    getInternalContext(startTime?: number) {
      return doGetInternalContext(parentContexts, userConfiguration.applicationId, session, startTime)
    },

    addUserAction(action: CustomUserAction, context?: Context) {
      lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, { action, context })
    },
  }
}

export function doGetInternalContext(
  parentContexts: ParentContexts,
  applicationId: string,
  session: RumSession,
  startTime?: number
) {
  const viewContext = parentContexts.findView(startTime)
  if (session.isTracked() && viewContext && viewContext.sessionId) {
    return (withSnakeCaseKeys(
      combine({ applicationId }, viewContext, parentContexts.findAction(startTime))
    ) as unknown) as InternalContext
  }
}

export function startRumEventCollection(
  applicationId: string,
  location: Location,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  getGlobalContext: () => Context
) {
  const parentContexts = startParentContexts(lifeCycle, session)
  const batch = startRumBatch(configuration, lifeCycle)
  startRumAssembly(applicationId, configuration, lifeCycle, session, parentContexts, getGlobalContext)
  startRumAssemblyV2(applicationId, configuration, lifeCycle, session, parentContexts, getGlobalContext)
  trackRumEvents(lifeCycle)
  startLongTaskCollection(lifeCycle, configuration)
  startResourceCollection(lifeCycle, configuration, session)
  startViewCollection(location, lifeCycle)

  return {
    parentContexts,

    stop() {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      batch.stop()
    },
  }
}

export function trackRumEvents(lifeCycle: LifeCycle) {
  const handler = (
    startTime: number,
    rawRumEvent: RawRumEvent,
    savedGlobalContext?: Context,
    customerContext?: Context
  ) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      customerContext,
      rawRumEvent,
      savedGlobalContext,
      startTime,
    })

  trackView(lifeCycle, handler)
  trackErrors(lifeCycle, handler)
  trackCustomUserAction(lifeCycle, handler)
  trackAutoUserAction(lifeCycle, handler)
}

export function trackView(lifeCycle: LifeCycle, handler: (startTime: number, event: RumViewEvent) => void) {
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
        loadingTime: msToNs(view.loadingTime),
        loadingType: view.loadingType,
        measures: {
          ...view.measures,
          domComplete: msToNs(view.measures.domComplete),
          domContentLoaded: msToNs(view.measures.domContentLoaded),
          domInteractive: msToNs(view.measures.domInteractive),
          firstContentfulPaint: msToNs(view.measures.firstContentfulPaint),
          loadEventEnd: msToNs(view.measures.loadEventEnd),
        },
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
  handler: (
    startTime: number,
    event: RumUserActionEvent,
    savedGlobalContext?: Context,
    customerContext?: Context
  ) => void
) {
  lifeCycle.subscribe(
    LifeCycleEventType.CUSTOM_ACTION_COLLECTED,
    ({ action: { name, type, context: customerContext, startTime }, context: savedGlobalContext }) => {
      handler(
        startTime,
        {
          date: getTimestamp(startTime),
          evt: {
            name,
            category: RumEventCategory.USER_ACTION,
          },
          userAction: {
            type,
          },
        },
        savedGlobalContext,
        customerContext
      )
    }
  )
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
