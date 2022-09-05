import type { Observable, TelemetryEvent, RawError } from '@datadog/browser-core'
import { startTelemetry, canUseEventBridge, getEventBridge } from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startForegroundContexts } from '../domain/contexts/foregroundContexts'
import { startInternalContext } from '../domain/contexts/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startViewContexts } from '../domain/contexts/viewContexts'
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
import { startUrlContexts } from '../domain/contexts/urlContexts'
import type { LocationChange } from '../browser/locationChangeObservable'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/rumEventsCollection/view/trackViews'
import type { RecorderApi } from './rumPublicApi'

export function startRum(
  configuration: RumConfiguration,
  getCommonContext: () => CommonContext,
  recorderApi: RecorderApi,
  initialViewOptions?: ViewOptions
) {
  const lifeCycle = new LifeCycle()

  const telemetry = startRumTelemetry(configuration)
  telemetry.setContextProvider(() => ({
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: session.findTrackedSession()?.id,
    },
    view: {
      id: viewContexts.findView()?.id,
    },
    action: {
      id: actionContexts.findActionId(),
    },
  }))

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  }
  if (!canUseEventBridge()) {
    startRumBatch(configuration, lifeCycle, telemetry.observable, reportError)
  } else {
    startRumEventBridge(lifeCycle)
  }

  const session = !canUseEventBridge() ? startRumSessionManager(configuration, lifeCycle) : startRumSessionManagerStub()
  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(location)

  const { viewContexts, foregroundContexts, urlContexts, actionContexts, addAction } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
    domMutationObservable,
    getCommonContext,
    reportError
  )

  startLongTaskCollection(lifeCycle, session)
  startResourceCollection(lifeCycle, configuration)
  const { addTiming, startView } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    foregroundContexts,
    recorderApi,
    initialViewOptions
  )
  const { addError } = startErrorCollection(lifeCycle, foregroundContexts)

  startRequestCollection(lifeCycle, configuration, session)
  startPerformanceCollection(lifeCycle, configuration)

  const internalContext = startInternalContext(
    configuration.applicationId,
    session,
    viewContexts,
    actionContexts,
    urlContexts
  )

  return {
    addAction,
    addError,
    addTiming,
    startView,
    lifeCycle,
    viewContexts,
    session,
    getInternalContext: internalContext.get,
  }
}

function startRumTelemetry(configuration: RumConfiguration) {
  const telemetry = startTelemetry(configuration)
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_telemetry', TelemetryEvent>()!
    telemetry.observable.subscribe((event) => bridge.send('internal_telemetry', event))
  }
  return telemetry
}

export function startRumEventCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  sessionManager: RumSessionManager,
  locationChangeObservable: Observable<LocationChange>,
  domMutationObservable: Observable<void>,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const viewContexts = startViewContexts(lifeCycle)
  const urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location)
  const foregroundContexts = startForegroundContexts()
  const { addAction, actionContexts } = startActionCollection(
    lifeCycle,
    domMutationObservable,
    configuration,
    foregroundContexts
  )

  startRumAssembly(
    configuration,
    lifeCycle,
    sessionManager,
    viewContexts,
    urlContexts,
    actionContexts,
    getCommonContext,
    reportError
  )

  return {
    viewContexts,
    foregroundContexts,
    urlContexts,
    addAction,
    actionContexts,
    stop: () => {
      viewContexts.stop()
      foregroundContexts.stop()
    },
  }
}
