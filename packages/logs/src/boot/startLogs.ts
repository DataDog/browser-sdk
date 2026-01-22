import type { TrackingConsentState, BufferedObservable, BufferedData, PageMayExitEvent } from '@datadog/browser-core'
import {
  Observable,
  sendToExtension,
  createPageMayExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
  startAccountContext,
  startGlobalContext,
  startTelemetry,
  TelemetryService,
  createIdentityEncoder,
  startUserContext,
  isWorkerEnvironment,
  startTelemetryTransport,
} from '@datadog/browser-core'
import { getPreStartHooks, getPreStartLogsObservable, getPreStartErrorBuffer, clearPreStartErrorBuffer } from './preStartLogs'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration } from '../domain/configuration'
import { startLogsAssembly } from '../domain/assembly'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import { startInternalContext } from '../domain/contexts/internalContext'
import { startReportError } from '../domain/reportError'
import type { CommonContext } from '../rawLogsEvent.types'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import { startRUMInternalContext } from '../domain/contexts/rumInternalContext'
import { startSessionContext } from '../domain/contexts/sessionContext'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'

const LOGS_STORAGE_KEY = 'logs'

export type StartLogs = typeof startLogs
export type StartLogsResult = ReturnType<StartLogs>

// ============================================================================
// START LOGS
// ============================================================================
// Split Telemetry Pattern:
// - Collection: Started in preStartLogs (Phase 4) - captures initialization events
// - Transport: Attached here in startLogs when dependencies ready
// - Buffer: Observable buffers events until transport subscription ready
//
// See Phase 4 planning docs for details on split pattern and race conditions.
// ============================================================================

export function startLogs(
  configuration: LogsConfiguration,
  getCommonContext: () => CommonContext,

  // `startLogs` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startLogs` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState,
  bufferedDataObservable: BufferedObservable<BufferedData>
) {
  const lifeCycle = new LifeCycle()
  // Phase 4: Use hooks from preStart if available, otherwise create new ones
  const hooks = getPreStartHooks() || createHooks()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)

  // Phase 4: Drain any errors collected during preStart phase
  const preStartErrorBuffer = getPreStartErrorBuffer()
  preStartErrorBuffer.forEach((error) => {
    reportError(error)
  })
  clearPreStartErrorBuffer()

  // Page exit is not observable in worker environments (no window/document events)
  const pageMayExitObservable = isWorkerEnvironment
    ? new Observable<PageMayExitEvent>()
    : createPageMayExitObservable(configuration)

  // ============================================================================
  // TELEMETRY TRANSPORT (Phase 4)
  // ============================================================================
  // Split Telemetry Pattern:
  // - Collection: Started in preStartLogs - captures initialization events
  // - Transport: Attached here when dependencies ready (reportError, pageMayExit)
  //
  // The BufferedObservable queues events until transport subscribes.
  // Sequence: (1) startTelemetryTransport subscribes, (2) unbuffer() replays buffered events
  //
  // CRITICAL: Subscribe BEFORE unbuffer() to prevent race condition losing first events.
  // ============================================================================
  const preStartLogsObservable = getPreStartLogsObservable()
  const { stop: stopTelemetryTransport } = startTelemetryTransport(
    configuration,
    reportError,
    pageMayExitObservable,
    createIdentityEncoder,
    preStartLogsObservable
  )
  cleanupTasks.push(stopTelemetryTransport)

  // Phase 4: Unbuffer preStart telemetry events now that transport is subscribed
  preStartLogsObservable.unbuffer()

  // Compatibility wrapper (telemetry object no longer exposed separately)
  const telemetry = {
    stop: stopTelemetryTransport,
    enabled: true,
    metricsEnabled: true,
  }

  const session =
    configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startLogsSessionManager(configuration, trackingConsentState)
      : startLogsSessionManagerStub(configuration)

  startTrackingConsentContext(hooks, trackingConsentState)
  // Start user and account context first to allow overrides from global context
  startSessionContext(hooks, configuration, session)
  const accountContext = startAccountContext(hooks, configuration, LOGS_STORAGE_KEY)
  const userContext = startUserContext(hooks, configuration, session, LOGS_STORAGE_KEY)
  const globalContext = startGlobalContext(hooks, configuration, LOGS_STORAGE_KEY, false)
  startRUMInternalContext(hooks)

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  bufferedDataObservable.unbuffer()
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(configuration, lifeCycle, hooks, getCommonContext, reportError)

  // Phase 4: Telemetry transport is separate from Logs transport (batch/bridge)
  // Both are now initialized; telemetry transports telemetry events, logs transport handles logs
  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      session
    )
    cleanupTasks.push(() => stopLogsBatch())
  } else {
    startLogsBridge(lifeCycle)
  }

  const internalContext = startInternalContext(session)

  return {
    handleLog,
    getInternalContext: internalContext.get,
    accountContext,
    globalContext,
    userContext,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
