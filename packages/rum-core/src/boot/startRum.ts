import type {
  Observable,
  RawError,
  DeflateEncoderStreamId,
  Encoder,
  TrackingConsentState,
  BufferedData,
  BufferedObservable,
  Telemetry,
} from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  canUseEventBridge,
  currentDrift,
  timeStampNow,
  addTelemetryDebug,
  startAccountContext,
  startGlobalContext,
  startUserContext,
<<<<<<< HEAD
  startTabContext,
=======
  globalContextDecoratorFactory,
  userContextDecoratorFactory,
  accountContextDecoratorFactory,
>>>>>>> 120667891 (✨ Wire RUM pipeline with all decorator factories, seal in startRumEventCollection)
} from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { createWindowOpenObservable } from '../browser/windowOpenObservable'
import { startInternalContext } from '../domain/contexts/internalContext'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startViewHistory } from '../domain/contexts/viewHistory'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection, actionContextDecoratorFactory } from '../domain/action/actionCollection'
import { startErrorCollection } from '../domain/error/errorCollection'
import { startResourceCollection } from '../domain/resource/resourceCollection'
import { startViewCollection, viewDecoratorFactory } from '../domain/view/viewCollection'
import type { RumSessionManager } from '../domain/rumSessionManager'
import { startRumSessionManager, startRumSessionManagerStub } from '../domain/rumSessionManager'
import { startRumBatch } from '../transport/startRumBatch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts, urlContextsDecoratorFactory } from '../domain/contexts/urlContexts'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import type { RumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { startFeatureFlagContexts, featureFlagDecoratorFactory } from '../domain/contexts/featureFlagContext'
import { startCustomerDataTelemetry } from '../domain/startCustomerDataTelemetry'
import { startPageStateHistory, pageStateDecoratorFactory } from '../domain/contexts/pageStateHistory'
import { startDisplayContext, displayDecoratorFactory } from '../domain/contexts/displayContext'
import type { CustomVitalsState } from '../domain/vital/vitalCollection'
import { startVitalCollection } from '../domain/vital/vitalCollection'
import { startCiVisibilityContext, ciVisibilityDecoratorFactory } from '../domain/contexts/ciVisibilityContext'
import { startLongTaskCollection } from '../domain/longTask/longTaskCollection'
import { startSyntheticsContext, syntheticsDecoratorFactory } from '../domain/contexts/syntheticsContext'
import { startRumAssembly } from '../domain/assembly'
import { startSessionContext, sessionDecoratorFactory } from '../domain/contexts/sessionContext'
import { startConnectivityContext, connectivityDecoratorFactory } from '../domain/contexts/connectivityContext'
import type { SdkName } from '../domain/contexts/defaultContext'
import { startDefaultContext, defaultContextDecoratorFactory } from '../domain/contexts/defaultContext'
import { startTrackingConsentContext, trackingConsentDecoratorFactory } from '../domain/contexts/trackingConsentContext'
import type { Hooks } from '../domain/hooks'
import { startEventCollection } from '../domain/event/eventCollection'
import { startInitialViewMetricsTelemetry } from '../domain/view/viewMetrics/startInitialViewMetricsTelemetry'
import { startSourceCodeContext, sourceCodeDecoratorFactory } from '../domain/contexts/sourceCodeContext'
import type { RecorderApi, ProfilerApi } from './rumPublicApi'
import { createRumPipeline } from '../domain/pipeline/createRumPipeline'

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
  telemetry: Telemetry,
  hooks: Hooks,
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

  // Create the RUM pipeline early so it can be used by session manager and page exit signal publishing.
  const rumPipeline = createRumPipeline()

  const pageMayExitObservable = createPageMayExitObservable(configuration)
  const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, event)
    rumPipeline.publish('signal', { type: 'pageMayExit', reason: event.reason })
  })
  cleanupTasks.push(() => pageMayExitSubscription.unsubscribe())

  const session = !canUseEventBridge()
    ? startRumSessionManager(configuration, lifeCycle, trackingConsentState, rumPipeline)
    : startRumSessionManagerStub()

  if (!canUseEventBridge()) {
    const batch = startRumBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      session.expireObservable,
      createEncoder,
      rumPipeline
    )
    const preparePageExitSubscription = batch.flushController.preparePageExitFlushObservable.subscribe((reason) => {
      lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, { reason })
    })
    cleanupTasks.push(() => preparePageExitSubscription.unsubscribe())
    cleanupTasks.push(() => batch.stop())
    startCustomerDataTelemetry(telemetry, lifeCycle, batch.flushController.flushObservable)
  } else {
    startRumEventBridge(lifeCycle)
    const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
      lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, event)
    })
    cleanupTasks.push(() => pageMayExitSubscription.unsubscribe())
  }

  startTrackingConsentContext(hooks, trackingConsentState)

  const { stop: stopInitialViewMetricsTelemetry } = startInitialViewMetricsTelemetry(lifeCycle, telemetry)
  cleanupTasks.push(stopInitialViewMetricsTelemetry)

  const { stop: stopRumEventCollection, ...startRumEventCollectionResult } = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    session,
    recorderApi,
    initialViewOptions,
    customVitalsState,
    bufferedDataObservable,
    sdkName,
    reportError,
    trackingConsentState,
    rumPipeline
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
    hooks,
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
  reportError: (error: RawError) => void,
  trackingConsentState: TrackingConsentState,
  pipeline?: ReturnType<typeof createRumPipeline>
) {
  const cleanupTasks: Array<() => void> = []

  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(configuration)
  const { observable: windowOpenObservable, stop: stopWindowOpen } = createWindowOpenObservable()
  cleanupTasks.push(stopWindowOpen)

  // Use the provided pipeline or create one (runs in parallel with the existing hooks-based assembly).
  // The profiling decorator is registered by the rum package's startRum, not here.
  const resolvedPipeline = pipeline ?? createRumPipeline()

  startDefaultContext(hooks, configuration, sdkName)
  const pageStateHistory = startPageStateHistory(hooks, configuration)
  cleanupTasks.push(() => pageStateHistory.stop())
  const viewHistory = startViewHistory(lifeCycle, resolvedPipeline)
  cleanupTasks.push(() => viewHistory.stop())
  const urlContexts = startUrlContexts(lifeCycle, hooks, locationChangeObservable)
  cleanupTasks.push(() => urlContexts.stop())
  const featureFlagContexts = startFeatureFlagContexts(lifeCycle, hooks, configuration)
  startSessionContext(hooks, session, recorderApi, viewHistory)
  startConnectivityContext(hooks)
  startTabContext(hooks)
  const globalContext = startGlobalContext(hooks, configuration, 'rum', true)
  const userContext = startUserContext(hooks, configuration, session, 'rum')
  const accountContext = startAccountContext(hooks, configuration, 'rum')

  const eventCollection = startEventCollection(lifeCycle)

  const displayContext = startDisplayContext(hooks, configuration)
  cleanupTasks.push(displayContext.stop)
  const ciVisibilityContext = startCiVisibilityContext(configuration, hooks)
  cleanupTasks.push(ciVisibilityContext.stop)
  startSyntheticsContext(hooks)

  startRumAssembly(configuration, lifeCycle, hooks, reportError)

  const actionCollection = startActionCollection(
    lifeCycle,
    hooks,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    resolvedPipeline
  )
  cleanupTasks.push(actionCollection.stop)

  resolvedPipeline.decorate(
    'observation',
    trackingConsentDecoratorFactory({ hasConsent: () => trackingConsentState.isGranted() })
  )
  resolvedPipeline.decorate(
    'observation',
    sessionDecoratorFactory({ getSession: () => session.findTrackedSession() ?? null })
  )
  resolvedPipeline.decorate(
    'observation',
    defaultContextDecoratorFactory({
      configuration,
      getCurrentDrift: currentDrift,
      getTimeStampNow: timeStampNow,
      canUseEventBridge,
      sdkName,
    })
  )
  resolvedPipeline.decorate('observation', viewDecoratorFactory({ findView: (t) => viewHistory.findView(t) }))
  resolvedPipeline.decorate(
    'observation',
    urlContextsDecoratorFactory({ findUrlContext: (t) => urlContexts.findUrl(t) })
  )
  resolvedPipeline.decorate(
    'observation',
    pageStateDecoratorFactory({
      findAll: (t, d) => pageStateHistory.findAll(t, d),
      wasInPageStateDuringPeriod: pageStateHistory.wasInPageStateDuringPeriod,
    })
  )
  resolvedPipeline.decorate(
    'observation',
    featureFlagDecoratorFactory({
      findFeatureFlags: (t) => featureFlagContexts.findFeatureFlags(t),
      trackForEventType: (type) =>
        (configuration.trackFeatureFlagsForEvents as string[]).concat(['view', 'error']).includes(type),
    })
  )
  resolvedPipeline.decorate('observation', connectivityDecoratorFactory())
  resolvedPipeline.decorate('observation', displayDecoratorFactory({ getViewport: () => displayContext.getViewport() }))
  resolvedPipeline.decorate('observation', syntheticsDecoratorFactory())
  resolvedPipeline.decorate(
    'observation',
    ciVisibilityDecoratorFactory({ getTestExecutionId: () => ciVisibilityContext.getTestExecutionId() })
  )
  resolvedPipeline.decorate(
    'observation',
    globalContextDecoratorFactory({ getContext: () => globalContext.getContext(), useContextNamespace: true })
  )
  resolvedPipeline.decorate(
    'observation',
    userContextDecoratorFactory({
      getUser: () => userContext.getContext() as { id?: string; email?: string; name?: string; [key: string]: unknown },
      getAnonymousId: () => session.findTrackedSession()?.anonymousId,
      trackAnonymousUser: configuration.trackAnonymousUser ?? false,
    })
  )
  resolvedPipeline.decorate(
    'observation',
    accountContextDecoratorFactory({
      getAccount: () =>
        accountContext.getContext() as { id: string; name?: string; [key: string]: unknown },
    })
  )
  resolvedPipeline.decorate(
    'observation',
    actionContextDecoratorFactory({ findActionId: actionCollection.actionContexts.findActionId })
  )
  // TODO: sourceCodeDecoratorFactory needs access to event data (handlingStack, error stack) for
  // accurate URL extraction — using a placeholder until Task 9 wires this properly.
  resolvedPipeline.decorate('observation', sourceCodeDecoratorFactory({ findContext: () => undefined }))

  resolvedPipeline.seal()

  const {
    addTiming,
    setLoadingTime,
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
    domMutationObservable,
    windowOpenObservable,
    locationChangeObservable,
    recorderApi,
    viewHistory,
    initialViewOptions,
    resolvedPipeline
  )

  startSourceCodeContext(hooks)

  cleanupTasks.push(stopViewCollection)

  const resourceCollection = startResourceCollection(lifeCycle, configuration, pageStateHistory, resolvedPipeline)
  cleanupTasks.push(resourceCollection.stop)

  const { stop: stopLongTaskCollection } = startLongTaskCollection(lifeCycle, configuration, resolvedPipeline)
  cleanupTasks.push(stopLongTaskCollection)

  const { addError } = startErrorCollection(lifeCycle, configuration, bufferedDataObservable, resolvedPipeline)

  startRequestCollection(lifeCycle, configuration, session, userContext, accountContext)

  const vitalCollection = startVitalCollection(lifeCycle, pageStateHistory, customVitalsState, resolvedPipeline)

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
    startResource: resourceCollection.startResource,
    stopResource: resourceCollection.stopResource,
    addEvent: eventCollection.addEvent,
    addError,
    addTiming,
    setLoadingTime,
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
    pipeline: resolvedPipeline,
    stop: () => cleanupTasks.forEach((task) => task()),
  }
}
