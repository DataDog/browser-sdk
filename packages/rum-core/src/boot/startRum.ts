import type {
  Observable,
  TelemetryEvent,
  RawError,
  DeflateEncoderStreamId,
  Encoder,
  CustomerDataTrackerManager,
  TrackingConsentState,
} from '@datadog/browser-core'
import {
  sendToExtension,
  createPageExitObservable,
  TelemetryService,
  startTelemetry,
  canUseEventBridge,
  getEventBridge,
  addTelemetryDebug,
  CustomerDataType,
  drainPreStartTelemetry,
} from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { createWindowOpenObservable } from '../browser/windowOpenObservable'
import { startRumAssembly } from '../domain/assembly'
import { startInternalContext } from '../domain/contexts/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import type { ViewHistory } from '../domain/contexts/viewHistory'
import { startViewHistory } from '../domain/contexts/viewHistory'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection } from '../domain/action/actionCollection'
import { startErrorCollection } from '../domain/error/errorCollection'
import { startResourceCollection } from '../domain/resource/resourceCollection'
import { startViewCollection } from '../domain/view/viewCollection'
import type { RumSessionManager } from '../domain/rumSessionManager'
import { startRumSessionManager, startRumSessionManagerStub } from '../domain/rumSessionManager'
import { startRumBatch } from '../transport/startRumBatch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts } from '../domain/contexts/urlContexts'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { startFeatureFlagContexts } from '../domain/contexts/featureFlagContext'
import { startCustomerDataTelemetry } from '../domain/startCustomerDataTelemetry'
import type { PageStateHistory } from '../domain/contexts/pageStateHistory'
import { startPageStateHistory } from '../domain/contexts/pageStateHistory'
import type { FeatureFlagContexts } from '../domain/contexts/featureFlagContext'
import type { CommonContext } from '../domain/contexts/commonContext'
import { startDisplayContext } from '../domain/contexts/displayContext'
import type { CustomVitalsState } from '../domain/vital/vitalCollection'
import { startVitalCollection } from '../domain/vital/vitalCollection'
import { startCiVisibilityContext } from '../domain/contexts/ciVisibilityContext'
import { startLongAnimationFrameCollection } from '../domain/longAnimationFrame/longAnimationFrameCollection'
import { RumPerformanceEntryType } from '../browser/performanceObservable'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { RecorderApi } from './rumPublicApi'

export type StartRum = typeof startRum
export type StartRumResult = ReturnType<StartRum>

export function startRum(
  configuration: RumConfiguration,
  recorderApi: RecorderApi,
  customerDataTrackerManager: CustomerDataTrackerManager,
  getCommonContext: () => CommonContext,
  initialViewOptions: ViewOptions | undefined,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,

  // `startRum` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startRum` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState,
  customVitalsState: CustomVitalsState
) {
  const cleanupTasks: Array<() => void> = []
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()

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
      id: viewHistory.findView()?.id,
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

  const session = !canUseEventBridge()
    ? startRumSessionManager(configuration, lifeCycle, trackingConsentState)
    : startRumSessionManagerStub()
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
    startCustomerDataTelemetry(configuration, telemetry, lifeCycle, customerDataTrackerManager, batch.flushObservable)
  } else {
    startRumEventBridge(lifeCycle)
  }

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(configuration, location)
  const pageStateHistory = startPageStateHistory(configuration)
  const viewHistory = startViewHistory(lifeCycle)
  const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable, location, viewHistory)

  const { observable: windowOpenObservable, stop: stopWindowOpen } = createWindowOpenObservable()
  cleanupTasks.push(stopWindowOpen)

  const {
    actionContexts,
    addAction,
    stop: stopRumEventCollection,
  } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    session,
    pageStateHistory,
    domMutationObservable,
    featureFlagContexts,
    windowOpenObservable,
    viewHistory,
    getCommonContext,
    reportError
  )
  cleanupTasks.push(stopRumEventCollection)

  drainPreStartTelemetry()

  const {
    addTiming,
    startView,
    setViewName,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    stop: stopViewCollection,
  } = startViewCollection(
    lifeCycle,
    hooks,
    configuration,
    location,
    domMutationObservable,
    windowOpenObservable,
    locationChangeObservable,
    pageStateHistory,
    recorderApi,
    viewHistory,
    initialViewOptions
  )

  cleanupTasks.push(stopViewCollection)

  const { stop: stopResourceCollection } = startResourceCollection(lifeCycle, configuration, pageStateHistory)
  cleanupTasks.push(stopResourceCollection)

  if (configuration.trackLongTasks) {
    if (PerformanceObserver.supportedEntryTypes?.includes(RumPerformanceEntryType.LONG_ANIMATION_FRAME)) {
      const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(lifeCycle, configuration)
      cleanupTasks.push(stopLongAnimationFrameCollection)
    } else {
      startLongTaskCollection(lifeCycle, configuration)
    }
  }

  const { addError } = startErrorCollection(lifeCycle, configuration, pageStateHistory)

  startRequestCollection(lifeCycle, configuration, session)

  const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, customVitalsState)
  const internalContext = startInternalContext(
    configuration.applicationId,
    session,
    viewHistory,
    actionContexts,
    urlContexts
  )

  return {
    addAction,
    addError,
    addTiming,
    addFeatureFlagEvaluation: featureFlagContexts.addFeatureFlagEvaluation,
    startView,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    setViewName,
    lifeCycle,
    viewHistory,
    session,
    stopSession: () => session.expire(),
    getInternalContext: internalContext.get,
    startDurationVital: vitalCollection.startDurationVital,
    stopDurationVital: vitalCollection.stopDurationVital,
    addDurationVital: vitalCollection.addDurationVital,
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
  hooks: Hooks,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  pageStateHistory: PageStateHistory,
  domMutationObservable: Observable<void>,
  featureFlagContexts: FeatureFlagContexts,
  windowOpenObservable: Observable<void>,
  viewHistory: ViewHistory,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const actionCollection = startActionCollection(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    pageStateHistory
  )

  const displayContext = startDisplayContext(configuration)
  const ciVisibilityContext = startCiVisibilityContext(configuration)

  startRumAssembly(
    configuration,
    lifeCycle,
    hooks,
    sessionManager,
    viewHistory,
    actionCollection.actionContexts,
    displayContext,
    ciVisibilityContext,
    featureFlagContexts,
    getCommonContext,
    reportError
  )

  return {
    pageStateHistory,
    addAction: actionCollection.addAction,
    actionContexts: actionCollection.actionContexts,
    stop: () => {
      actionCollection.stop()
      ciVisibilityContext.stop()
      displayContext.stop()
      pageStateHistory.stop()
    },
  }
}
