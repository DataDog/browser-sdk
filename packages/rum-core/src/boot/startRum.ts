import type { Observable, MonitoringMessage, TelemetryEvent } from '@datadog/browser-core'
import {
  startInternalMonitoring,
  combine,
  canUseEventBridge,
  startBatchWithReplica,
  getEventBridge,
} from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startForegroundContexts } from '../domain/foregroundContexts'
import { startInternalContext } from '../domain/internalContext'
import { LifeCycle } from '../domain/lifeCycle'
import { startViewContexts } from '../domain/viewContexts'
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
import type { ViewOptions } from '../domain/rumEventsCollection/view/trackViews'
import type { RecorderApi } from './rumPublicApi'

export function startRum(
  configuration: RumConfiguration,
  getCommonContext: () => CommonContext,
  recorderApi: RecorderApi,
  initialViewOptions?: ViewOptions
) {
  const lifeCycle = new LifeCycle()

  const internalMonitoring = startRumInternalMonitoring(configuration)
  internalMonitoring.setExternalContextProvider(() =>
    combine(
      {
        application_id: configuration.applicationId,
        session: {
          id: session.findTrackedSession()?.id,
        },
      },
      viewContexts.findView(),
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
      id: viewContexts.findView()?.view.id,
    },
    action: {
      id: actionContexts.findActionId(),
    },
  }))

  if (!canUseEventBridge()) {
    startRumBatch(configuration, lifeCycle, internalMonitoring.telemetryEventObservable)
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

function startRumInternalMonitoring(configuration: RumConfiguration) {
  const internalMonitoring = startInternalMonitoring(configuration)
  if (canUseEventBridge()) {
    const bridge = getEventBridge<'internal_log' | 'internal_telemetry', MonitoringMessage | TelemetryEvent>()!
    internalMonitoring.monitoringMessageObservable.subscribe((message) => bridge.send('internal_log', message))
    internalMonitoring.telemetryEventObservable.subscribe((message) => bridge.send('internal_telemetry', message))
  } else if (configuration.internalMonitoringEndpointBuilder) {
    const batch = startBatchWithReplica(
      configuration,
      configuration.internalMonitoringEndpointBuilder,
      configuration.replica?.internalMonitoringEndpointBuilder
    )
    internalMonitoring.monitoringMessageObservable.subscribe((message) => batch.add(message))
  }
  return internalMonitoring
}

export function startRumEventCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  location: Location,
  sessionManager: RumSessionManager,
  locationChangeObservable: Observable<LocationChange>,
  domMutationObservable: Observable<void>,
  getCommonContext: () => CommonContext
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
    getCommonContext
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
