import type { TrackingConsentState } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
  startAccountContext,
} from '@datadog/browser-core'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
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
import { startLogsTelemetry } from '../domain/logsTelemetry'
import type { CommonContext } from '../rawLogsEvent.types'
import { createHooks } from '../domain/hooks'
import { startRUMInternalContext } from '../domain/contexts/rumInternalContext'
import { startGlobalContext } from '../domain/contexts/globalContext'

export type StartLogs = typeof startLogs
export type StartLogsResult = ReturnType<StartLogs>

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  getCommonContext: () => CommonContext,

  // `startLogs` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startLogs` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState
) {
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)
  const pageMayExitObservable = createPageMayExitObservable(configuration)

  const session =
    configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startLogsSessionManager(configuration, trackingConsentState)
      : startLogsSessionManagerStub(configuration)

  const accountContext = startAccountContext(hooks, configuration, 'logs')
  const globalContext = startGlobalContext(hooks, configuration)
  const { stop, getRUMInternalContext } = startRUMInternalContext(hooks)

  const { stop: stopLogsTelemetry } = startLogsTelemetry(
    initConfiguration,
    configuration,
    reportError,
    pageMayExitObservable,
    session,
    getRUMInternalContext
  )
  cleanupTasks.push(() => stopLogsTelemetry())

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle)
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(session, configuration, lifeCycle, hooks, getCommonContext, reportError)

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
    stop: () => {
      cleanupTasks.forEach((task) => task())
      stop()
    },
  }
}
