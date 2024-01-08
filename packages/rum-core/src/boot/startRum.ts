import type {
  Observable,
  TelemetryEvent,
  RawError,
  ContextManager,
  DeflateEncoderStreamId,
  Encoder,
  CustomerDataTrackerManager,
} from '@datadog/browser-core'
import {
  sendToExtension,
  createPageExitObservable,
  TelemetryService,
  addTelemetryConfiguration,
  startTelemetry,
  canUseEventBridge,
  getEventBridge,
  addTelemetryDebug,
  CustomerDataType,
} from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startInternalContext } from '../domain/contexts/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startViewContexts } from '../domain/contexts/viewContexts'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection } from '../domain/action/actionCollection'
import { startErrorCollection } from '../domain/error/errorCollection'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import { startResourceCollection } from '../domain/resource/resourceCollection'
import { startViewCollection } from '../domain/view/viewCollection'
import type { RumSessionManager } from '../domain/rumSessionManager'
import { startRumSessionManager, startRumSessionManagerStub } from '../domain/rumSessionManager'
import { startRumBatch } from '../transport/startRumBatch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts } from '../domain/contexts/urlContexts'
import type { LocationChange } from '../browser/locationChangeObservable'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { serializeRumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { startFeatureFlagContexts } from '../domain/contexts/featureFlagContext'
import { startCustomerDataTelemetry } from '../domain/startCustomerDataTelemetry'
import { startPageStateHistory } from '../domain/contexts/pageStateHistory'
import type { CommonContext } from '../domain/contexts/commonContext'
import { buildCommonContext } from '../domain/contexts/commonContext'
import { startDisplayContext } from '../domain/contexts/displayContext'
import type { RecorderApi } from './rumPublicApi'

export function startRum(
  initConfiguration: RumInitConfiguration,
  configuration: RumConfiguration,
  recorderApi: RecorderApi,
  customerDataTrackerManager: CustomerDataTrackerManager,
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  initialViewOptions: ViewOptions | undefined,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const cleanupTasks: Array<() => void> = []
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
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }
  const featureFlagContexts = startFeatureFlagContexts(
    lifeCycle,
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.FeatureFlag)
  )

  const pageExitObservable = createPageExitObservable(configuration)
  const pageExitSubscription = pageExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, event)
  })
  cleanupTasks.push(() => pageExitSubscription.unsubscribe())

  const session = !canUseEventBridge() ? startRumSessionManager(configuration, lifeCycle) : startRumSessionManagerStub()
  if (!canUseEventBridge()) {
    const batch = startRumBatch(
      configuration,
      lifeCycle,
      telemetry.observable,
      reportError,
      pageExitObservable,
      session.expireObservable,
      createEncoder
    )
    cleanupTasks.push(() => batch.stop())
    startCustomerDataTelemetry(
      configuration,
      telemetry,
      lifeCycle,
      customerDataTrackerManager,
      globalContextManager,
      userContextManager,
      featureFlagContexts,
      batch.flushObservable
    )
  } else {
    startRumEventBridge(lifeCycle)
  }

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(configuration, location)

  const {
    viewContexts,
    pageStateHistory,
    urlContexts,
    actionContexts,
    addAction,
    stop: stopRumEventCollection,
  } = startRumEventCollection(
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
    domMutationObservable,
    () => buildCommonContext(globalContextManager, userContextManager, recorderApi),
    reportError
  )
  cleanupTasks.push(stopRumEventCollection)

  addTelemetryConfiguration(serializeRumConfiguration(initConfiguration))

  startLongTaskCollection(lifeCycle, configuration, session)
  startResourceCollection(lifeCycle, configuration, session, pageStateHistory)

  const {
    addTiming,
    startView,
    stop: stopViewCollection,
  } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    featureFlagContexts,
    pageStateHistory,
    recorderApi,
    initialViewOptions
  )
  cleanupTasks.push(stopViewCollection)

  const { addError } = startErrorCollection(lifeCycle, configuration, pageStateHistory, featureFlagContexts)

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
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
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
  reportError: (error: RawError) => void
) {
  const viewContexts = startViewContexts(lifeCycle)
  const urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location)

  const pageStateHistory = startPageStateHistory(configuration)

  const { addAction, actionContexts } = startActionCollection(
    lifeCycle,
    domMutationObservable,
    configuration,
    pageStateHistory
  )

  const displayContext = startDisplayContext(configuration)

  startRumAssembly(
    configuration,
    lifeCycle,
    sessionManager,
    viewContexts,
    urlContexts,
    actionContexts,
    displayContext,
    buildCommonContext,
    reportError
  )

  return {
    viewContexts,
    pageStateHistory,
    urlContexts,
    addAction,
    actionContexts,
    stop: () => {
      displayContext.stop()
      pageStateHistory.stop()
      urlContexts.stop()
      viewContexts.stop()
      pageStateHistory.stop()
    },
  }
}
