import type {
  Observable,
  RawError,
  DeflateEncoderStreamId,
  Encoder,
  TrackingConsentState,
  BufferedData,
  BufferedObservable,
} from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  TelemetryService,
  startTelemetry,
  canUseEventBridge,
  addTelemetryDebug,
  startAccountContext,
  startGlobalContext,
  startUserContext,
} from '@datadog/browser-core'
import type { RumMutationRecord } from '../browser/domMutationObservable'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { createWindowOpenObservable } from '../browser/windowOpenObservable'
import { startInternalContext } from '../domain/contexts/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startViewHistory } from '../domain/contexts/viewHistory'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection } from '../domain/action/actionCollection'
import { startErrorCollection } from '../domain/error/errorCollection'
import { startResourceCollection } from '../domain/resource/resourceCollection'
import { startViewCollection } from '../domain/view/viewCollection'
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
import { startDisplayContext } from '../domain/contexts/displayContext'
import type { CustomVitalsState } from '../domain/vital/vitalCollection'
import { startVitalCollection } from '../domain/vital/vitalCollection'
import { startCiVisibilityContext } from '../domain/contexts/ciVisibilityContext'
import { startLongAnimationFrameCollection } from '../domain/longAnimationFrame/longAnimationFrameCollection'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../browser/performanceObservable'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import { startSyntheticsContext } from '../domain/contexts/syntheticsContext'
import { startRumAssembly } from '../domain/assembly'
import { startSessionContext } from '../domain/contexts/sessionContext'
import { startConnectivityContext } from '../domain/contexts/connectivityContext'
import { startDefaultContext } from '../domain/contexts/defaultContext'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import { startEventCollection } from '../domain/event/eventCollection'
import type { RecorderApi, ProfilerApi } from './rumPublicApi'

export type StartRum = typeof startRum
export type StartRumResult = ReturnType<StartRum>

export function startRum(
  configuration: RumConfiguration,
  recorderApi: RecorderApi,
  profilerApi: ProfilerApi,
  initialViewOptions: ViewOptions | undefined,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,

  // `startRum` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startRum` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState,
  customVitalsState: CustomVitalsState,
  bufferedDataObservable: BufferedObservable<BufferedData>,
  sdkName: 'rum' | 'rum-slim' | 'rum-synthetics' | undefined
) {
  const cleanupTasks: Array<() => void> = []
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => sendToExtension('rum', event))

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const pageMayExitObservable = createPageMayExitObservable(configuration)
  const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, event)
  })
  cleanupTasks.push(() => pageMayExitSubscription.unsubscribe())

  const telemetry = startTelemetry(
    TelemetryService.RUM,
    configuration,
    hooks,
    reportError,
    pageMayExitObservable,
    createEncoder
  )
  cleanupTasks.push(telemetry.stop)

  const session = !canUseEventBridge()
    ? startRumSessionManager(configuration, lifeCycle, trackingConsentState)
    : startRumSessionManagerStub()

  if (!canUseEventBridge()) {
    const batch = startRumBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      session.expireObservable,
      createEncoder
    )
    cleanupTasks.push(() => batch.stop())
    startCustomerDataTelemetry(configuration, telemetry, lifeCycle, batch.flushObservable)
  } else {
    startRumEventBridge(lifeCycle)
  }

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(configuration, location)
  const { observable: windowOpenObservable, stop: stopWindowOpen } = createWindowOpenObservable()
  cleanupTasks.push(stopWindowOpen)

  startDefaultContext(hooks, configuration, sdkName)
  const pageStateHistory = startPageStateHistory(hooks, configuration)
  const viewHistory = startViewHistory(lifeCycle)
  cleanupTasks.push(() => viewHistory.stop())
  const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable, location)
  cleanupTasks.push(() => urlContexts.stop())
  const featureFlagContexts = startFeatureFlagContexts(lifeCycle, hooks, configuration)
  startSessionContext(hooks, session, recorderApi, viewHistory)
  startConnectivityContext(hooks)
  startTrackingConsentContext(hooks, trackingConsentState)
  const globalContext = startGlobalContext(hooks, configuration, 'rum', true)
  const userContext = startUserContext(hooks, configuration, session, 'rum')
  const accountContext = startAccountContext(hooks, configuration, 'rum')

  const {
    actionContexts,
    addAction,
    addEvent,
    stop: stopRumEventCollection,
  } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    pageStateHistory,
    domMutationObservable,
    windowOpenObservable,
    reportError
  )
  cleanupTasks.push(stopRumEventCollection)

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
    recorderApi,
    viewHistory,
    initialViewOptions
  )

  cleanupTasks.push(stopViewCollection)

  const { stop: stopResourceCollection } = startResourceCollection(lifeCycle, configuration, pageStateHistory)
  cleanupTasks.push(stopResourceCollection)

  if (configuration.trackLongTasks) {
    if (supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)) {
      const { stop: stopLongAnimationFrameCollection } = startLongAnimationFrameCollection(lifeCycle, configuration)
      cleanupTasks.push(stopLongAnimationFrameCollection)
    } else {
      startLongTaskCollection(lifeCycle, configuration)
    }
  }

  const { addError } = startErrorCollection(lifeCycle, configuration, bufferedDataObservable)
  bufferedDataObservable.unbuffer()

  startRequestCollection(lifeCycle, configuration, session, userContext, accountContext)

  const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, customVitalsState)
  const internalContext = startInternalContext(
    configuration.applicationId,
    session,
    viewHistory,
    actionContexts,
    urlContexts
  )

  // Add Clean-up tasks for Profiler API.
  cleanupTasks.push(() => profilerApi.stop())

  return {
    addAction,
    addEvent,
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
    globalContext,
    userContext,
    accountContext,
    telemetry,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
    hooks,
  }
}

export function startRumEventCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  reportError: (error: RawError) => void
) {
  const actionCollection = startActionCollection(
    lifeCycle,
    hooks,
    domMutationObservable,
    windowOpenObservable,
    configuration
  )

  const eventCollection = startEventCollection(lifeCycle)

  const displayContext = startDisplayContext(hooks, configuration)
  const ciVisibilityContext = startCiVisibilityContext(configuration, hooks)
  startSyntheticsContext(hooks)

  startRumAssembly(configuration, lifeCycle, hooks, reportError)

  return {
    pageStateHistory,
    addAction: actionCollection.addAction,
    addEvent: eventCollection.addEvent,
    actionContexts: actionCollection.actionContexts,
    stop: () => {
      actionCollection.stop()
      ciVisibilityContext.stop()
      displayContext.stop()
      pageStateHistory.stop()
    },
  }
}
