import type { TrackingConsentState } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
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
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)
  const pageExitObservable = createPageExitObservable(configuration)

  const session =
    configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startLogsSessionManager(configuration, trackingConsentState)
      : startLogsSessionManagerStub(configuration)

  const { stop: stopLogsTelemetry } = startLogsTelemetry(
    initConfiguration,
    configuration,
    reportError,
    pageExitObservable,
    session
  )
  cleanupTasks.push(() => stopLogsTelemetry())

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle)
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(session, configuration, lifeCycle, getCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(configuration, lifeCycle, reportError, pageExitObservable, session)
    cleanupTasks.push(() => stopLogsBatch())
  } else {
    startLogsBridge(lifeCycle)
  }

  const internalContext = startInternalContext(session)

  return {
    handleLog,
    getInternalContext: internalContext.get,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
