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
  startTelemetryTransport,
  canUseEventBridge,
  addTelemetryDebug,
  startAccountContext,
  startGlobalContext,
  startUserContext,
} from '@datadog/browser-core'
import { getPreStartErrorBuffer, clearPreStartErrorBuffer, getPreStartTelemetryObservable, getPreStartHooks } from './preStartRum'
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
import { startPageStateHistory } from '../domain/contexts/pageStateHistory'
import { startDisplayContext } from '../domain/contexts/displayContext'
import type { CustomVitalsState } from '../domain/vital/vitalCollection'
import { startVitalCollection } from '../domain/vital/vitalCollection'
import { startCiVisibilityContext } from '../domain/contexts/ciVisibilityContext'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import { startSyntheticsContext } from '../domain/contexts/syntheticsContext'
import { startRumAssembly } from '../domain/assembly'
import { startSessionContext } from '../domain/contexts/sessionContext'
import { startConnectivityContext } from '../domain/contexts/connectivityContext'
import type { SdkName } from '../domain/contexts/defaultContext'
import { startDefaultContext } from '../domain/contexts/defaultContext'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import { startEventCollection } from '../domain/event/eventCollection'
import { startInitialViewMetricsTelemetry } from '../domain/view/viewMetrics/startInitialViewMetricsTelemetry'
import { startSourceCodeContext } from '../domain/contexts/sourceCodeContext'
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
  hooks: Hooks | undefined,
  sdkName?: SdkName
) {
  const cleanupTasks: Array<() => void> = []
  const lifeCycle = new LifeCycle()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => sendToExtension('rum', event))

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  // Phase 2: Drain any errors collected during preStart phase
  const preStartErrorBuffer = getPreStartErrorBuffer()
  preStartErrorBuffer.forEach((error) => {
    reportError(error)
  })
  clearPreStartErrorBuffer()

  // Hooks should always be defined when startRum is called from preStart initialization
  const definedHooks = hooks || createHooks()

  const pageMayExitObservable = createPageMayExitObservable(configuration)
  const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, event)
  })
  cleanupTasks.push(() => pageMayExitSubscription.unsubscribe())

  // ============================================================================
  // TELEMETRY TRANSPORT (Phase 3)
  // ============================================================================
  // Split Telemetry Pattern:
  // - Collection: Started in preStartRum (Phase 2) - captures initialization events
  // - Transport: Attached here when dependencies ready (encoder, reportError, pageMayExit)
  //
  // Why split? Dependencies like encoder and reportError aren't available in preStart.
  // The BufferedObservable queues events until transport subscribes, then unbuffer()
  // replays them. This ensures no initialization telemetry is lost.
  //
  // Observable lifecycle:
  // 1. Created in preStartRum via getPreStartTelemetryObservable() (lazy singleton)
  // 2. Collection fills buffer during preStart phase
  // 3. Transport subscribes here, then calls unbuffer() to replay events
  // 4. After unbuffer: buffer cleared, future events flow directly to transport
  //
  // Note: Telemetry transport is SEPARATE from RUM transport (startRumBatch/startRumEventBridge).
  // Telemetry uses its own batch and endpoint. RUM transport handles customer events.
  // ============================================================================
  const preStartTelemetryObservable = getPreStartTelemetryObservable()
  const { stop: stopTelemetryTransport } = startTelemetryTransport(
    configuration,
    reportError,
    pageMayExitObservable,
    createEncoder,
    preStartTelemetryObservable
  )
  cleanupTasks.push(stopTelemetryTransport)

  // Telemetry object for startCustomerDataTelemetry compatibility
  // Collection is assumed enabled since it was started in preStart
  const telemetry = {
    stop: stopTelemetryTransport,
    enabled: true,
    metricsEnabled: true,
  }

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
    startCustomerDataTelemetry(telemetry, lifeCycle, batch.flushController.flushObservable)
  } else {
    startRumEventBridge(lifeCycle)
  }

  startTrackingConsentContext(definedHooks, trackingConsentState)

  const { stop: stopInitialViewMetricsTelemetry } = startInitialViewMetricsTelemetry(lifeCycle, telemetry)
  cleanupTasks.push(stopInitialViewMetricsTelemetry)

  const { stop: stopRumEventCollection, ...startRumEventCollectionResult } = startRumEventCollection(
    lifeCycle,
    definedHooks,
    configuration,
    session,
    recorderApi,
    initialViewOptions,
    customVitalsState,
    bufferedDataObservable,
    sdkName,
    reportError
  )
  cleanupTasks.push(stopRumEventCollection)
  bufferedDataObservable.unbuffer()

  // Add Clean-up tasks for Profiler API.
  cleanupTasks.push(() => profilerApi.stop())

  return {
    ...startRumEventCollectionResult,
    lifeCycle,
    session,
    stopSession: () => session.expire(),
    telemetry,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
    hooks: definedHooks,
  }
}

export function startRumEventCollection(
  lifeCycle: LifeCycle,
  hooks: Hooks,
  configuration: RumConfiguration,
  session: RumSessionManager,
  recorderApi: RecorderApi,
  initialViewOptions: ViewOptions | undefined,
  customVitalsState: CustomVitalsState,
  bufferedDataObservable: Observable<BufferedData>,
  sdkName: SdkName | undefined,
  reportError: (error: RawError) => void
) {
  const cleanupTasks: Array<() => void> = []

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(configuration, location)
  const { observable: windowOpenObservable, stop: stopWindowOpen } = createWindowOpenObservable()
  cleanupTasks.push(stopWindowOpen)

  startDefaultContext(hooks, configuration, sdkName)
  const pageStateHistory = startPageStateHistory(hooks, configuration)
  cleanupTasks.push(() => pageStateHistory.stop())
  const viewHistory = startViewHistory(lifeCycle)
  cleanupTasks.push(() => viewHistory.stop())
  const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable, location)
  cleanupTasks.push(() => urlContexts.stop())
  const featureFlagContexts = startFeatureFlagContexts(lifeCycle, hooks, configuration)
  startSessionContext(hooks, session, recorderApi, viewHistory)
  startConnectivityContext(hooks)
  const globalContext = startGlobalContext(hooks, configuration, 'rum', true)
  const userContext = startUserContext(hooks, configuration, session, 'rum')
  const accountContext = startAccountContext(hooks, configuration, 'rum')

  const actionCollection = startActionCollection(
    lifeCycle,
    hooks,
    domMutationObservable,
    windowOpenObservable,
    configuration
  )
  cleanupTasks.push(actionCollection.stop)

  const eventCollection = startEventCollection(lifeCycle)

  const displayContext = startDisplayContext(hooks, configuration)
  cleanupTasks.push(displayContext.stop)
  const ciVisibilityContext = startCiVisibilityContext(configuration, hooks)
  cleanupTasks.push(ciVisibilityContext.stop)
  startSyntheticsContext(hooks)

  startRumAssembly(configuration, lifeCycle, hooks, reportError)

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

  startSourceCodeContext(hooks)

  cleanupTasks.push(stopViewCollection)

  const { stop: stopResourceCollection } = startResourceCollection(lifeCycle, configuration, pageStateHistory)
  cleanupTasks.push(stopResourceCollection)

  const { stop: stopLongTaskCollection, longTaskContexts } = startLongTaskCollection(lifeCycle, configuration)
  cleanupTasks.push(stopLongTaskCollection)

  const { addError } = startErrorCollection(lifeCycle, configuration, bufferedDataObservable)

  startRequestCollection(lifeCycle, configuration, session, userContext, accountContext)

  const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, customVitalsState)

  const internalContext = startInternalContext(
    configuration.applicationId,
    session,
    viewHistory,
    actionCollection.actionContexts,
    urlContexts
  )

  return {
    addAction: actionCollection.addAction,
    startAction: actionCollection.startAction,
    stopAction: actionCollection.stopAction,
    addEvent: eventCollection.addEvent,
    addError,
    addTiming,
    addFeatureFlagEvaluation: featureFlagContexts.addFeatureFlagEvaluation,
    startView,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    setViewName,
    viewHistory,
    getInternalContext: internalContext.get,
    startDurationVital: vitalCollection.startDurationVital,
    stopDurationVital: vitalCollection.stopDurationVital,
    addDurationVital: vitalCollection.addDurationVital,
    addOperationStepVital: vitalCollection.addOperationStepVital,
    globalContext,
    userContext,
    accountContext,
    longTaskContexts,
    stop: () => cleanupTasks.forEach((task) => task()),
  }
}
