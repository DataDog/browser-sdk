import type { InternalMonitoring, Observable } from '@datadog/browser-core'
import { combine, canUseEventBridge } from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startForegroundContexts } from '../domain/foregroundContexts'
import { startInternalContext } from '../domain/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startParentContexts } from '../domain/parentContexts'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection } from '../domain/rumEventsCollection/action/actionCollection'
import { startErrorCollection } from '../domain/rumEventsCollection/error/errorCollection'
import { startLongTaskCollection } from '../domain/rumEventsCollection/longTask/longTaskCollection'
import { startResourceCollection } from '../domain/rumEventsCollection/resource/resourceCollection'
import { startViewCollection } from '../domain/rumEventsCollection/view/viewCollection'
import type { RumSessionManager } from '../domain/rumSessionManager'
import { startRumSessionManager, startRumSessionManagerStub } from '../domain/rumSessionManager'
import type { CommonContext } from '../rawRumEvent.types'
import { startRumBatch } from '../transport/startRumBatch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts } from '../domain/urlContexts'
import type { LocationChange } from '../browser/locationChangeObservable'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration } from '../domain/configuration'
import type { RecorderApi } from './rumPublicApi'

export function startRum(
  configuration: RumConfiguration,
  internalMonitoring: InternalMonitoring,
  getCommonContext: () => CommonContext,
  recorderApi: RecorderApi,
  initialViewName?: string
) {
  const lifeCycle = new LifeCycle()
  const session = !canUseEventBridge() ? startRumSessionManager(configuration, lifeCycle) : startRumSessionManagerStub()
  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(location)

  internalMonitoring.setExternalContextProvider(() =>
    combine(
      {
        application_id: configuration.applicationId,
        session: {
          id: session.findTrackedSession()?.id,
        },
      },
      parentContexts.findView(),
      { view: { name: null } }
    )
  )
  internalMonitoring.setTelemetryContextProvider(() => ({
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: session.findTrackedSession()?.id,
    },
    view: {
      id: parentContexts.findView()?.id,
    },
    action: {
      id: parentContexts.findAction()?.id,
    },
  }))
  internalMonitoring.telemetryEventObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.TELEMETRY_EVENT_COLLECTED, event)
  })

  const { parentContexts, foregroundContexts, urlContexts } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
    getCommonContext
  )

  startLongTaskCollection(lifeCycle, session)
  startResourceCollection(lifeCycle)
  const { addTiming, startView } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    foregroundContexts,
    recorderApi,
    initialViewName
  )
  const { addError } = startErrorCollection(lifeCycle, foregroundContexts)
  const { addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, foregroundContexts)

  startRequestCollection(lifeCycle, configuration, session)
  startPerformanceCollection(lifeCycle, configuration)

  const internalContext = startInternalContext(configuration.applicationId, session, parentContexts, urlContexts)

  return {
    addAction,
    addError,
    addTiming,
    startView,
    lifeCycle,
    parentContexts,
    session,
    getInternalContext: internalContext.get,
  }
}

export function startRumEventCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  sessionManager: RumSessionManager,
  locationChangeObservable: Observable<LocationChange>,
  getCommonContext: () => CommonContext
) {
  const parentContexts = startParentContexts(lifeCycle)
  const urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location)
  const foregroundContexts = startForegroundContexts()

  let stopBatch: () => void

  if (canUseEventBridge()) {
    startRumEventBridge(lifeCycle)
  } else {
    ;({ stop: stopBatch } = startRumBatch(configuration, lifeCycle))
  }

  startRumAssembly(configuration, lifeCycle, sessionManager, parentContexts, urlContexts, getCommonContext)

  return {
    parentContexts,
    foregroundContexts,
    urlContexts,
    stop: () => {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      stopBatch?.()
      parentContexts.stop()
      foregroundContexts.stop()
    },
  }
}
