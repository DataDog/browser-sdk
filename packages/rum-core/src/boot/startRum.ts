import type { Observable, TelemetryEvent, RawError, ContextManager } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageExitObservable,
  TelemetryService,
  addTelemetryConfiguration,
  startTelemetry,
  canUseEventBridge,
  getEventBridge,
} from '@datadog/browser-core'
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
import { startRumBatch } from '../transport/startRumBatch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts } from '../domain/contexts/urlContexts'
import type { LocationChange } from '../browser/locationChangeObservable'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { serializeRumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/rumEventsCollection/view/trackViews'
import { startFeatureFlagContexts } from '../domain/contexts/featureFlagContext'
import { startCustomerDataTelemetry } from '../domain/startCustomerDataTelemetry'
import { startPageStateHistory } from '../domain/contexts/pageStateHistory'
import type { CommonContext } from '../domain/contexts/commonContext'
import { buildCommonContext } from '../domain/contexts/commonContext'
import type { RecorderApi, RumPlugin } from './rumPublicApi'

export function startRum(
  initConfiguration: RumInitConfiguration,
  configuration: RumConfiguration,
  recorderApi: RecorderApi,
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  rumPlugins: RumPlugin[],
  initialViewOptions?: ViewOptions
) {
  const lifeCycle = new LifeCycle()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => sendToExtension('rum', event))

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
  const featureFlagContexts = startFeatureFlagContexts(lifeCycle)

  const pageExitObservable = createPageExitObservable()
  pageExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, event)
  })

  const session = !canUseEventBridge() ? startRumSessionManager(configuration, lifeCycle) : startRumSessionManagerStub()
  if (!canUseEventBridge()) {
    const batch = startRumBatch(
      configuration,
      lifeCycle,
      telemetry.observable,
      reportError,
      pageExitObservable,
      session.expireObservable
    )
    startCustomerDataTelemetry(
      configuration,
      telemetry,
      lifeCycle,
      globalContextManager,
      userContextManager,
      featureFlagContexts,
      batch.flushObservable
    )
  } else {
    startRumEventBridge(lifeCycle)
  }

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(location)

  const { viewContexts, foregroundContexts, urlContexts, actionContexts, addAction } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
    domMutationObservable,
    () => buildCommonContext(globalContextManager, userContextManager, recorderApi),
    reportError,
    rumPlugins
  )

  addTelemetryConfiguration(serializeRumConfiguration(initConfiguration))

  startLongTaskCollection(lifeCycle, session)
  const pageStateHistory = startPageStateHistory()
  startResourceCollection(lifeCycle, configuration, session, pageStateHistory)
  const { addTiming, startView } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    foregroundContexts,
    featureFlagContexts,
    recorderApi,
    initialViewOptions
  )
  const { addError } = startErrorCollection(lifeCycle, foregroundContexts, featureFlagContexts)

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
    addFeatureFlagEvaluation: featureFlagContexts.addFeatureFlagEvaluation,
    startView,
    lifeCycle,
    viewContexts,
    session,
    stopSession: () => session.expire(),
    getInternalContext: internalContext.get,
  }
}

function startRumTelemetry(configuration: RumConfiguration) {
  const telemetry = startTelemetry(TelemetryService.RUM, configuration)
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
  buildCommonContext: () => CommonContext,
  reportError: (error: RawError) => void,
  rumPlugins: RumPlugin[]
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
    buildCommonContext,
    reportError,
    rumPlugins
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
