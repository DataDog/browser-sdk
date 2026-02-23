import type { BufferedObservable, BufferedData } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  canUseEventBridge,
  startAccountContext,
  startGlobalContext,
  startUserContext,
} from '@datadog/browser-core'
import type { LogsSessionManager } from '../domain/logsSessionManager'
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
import { startRUMInternalContext } from '../domain/contexts/rumInternalContext'
import { startSessionContext } from '../domain/contexts/sessionContext'

const LOGS_STORAGE_KEY = 'logs'

export type StartLogs = typeof startLogs
export type StartLogsResult = ReturnType<StartLogs>

export function startLogs(
  configuration: LogsConfiguration,
  sessionManager: LogsSessionManager,
  getCommonContext: () => CommonContext,
  bufferedDataObservable: BufferedObservable<BufferedData>,
  hooks: Hooks
) {
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)
  const pageMayExitObservable = createPageMayExitObservable(configuration)

  // Start user and account context first to allow overrides from global context
  startSessionContext(hooks, configuration, sessionManager)
  const accountContext = startAccountContext(hooks, configuration, LOGS_STORAGE_KEY)
  const userContext = startUserContext(hooks, configuration, sessionManager, LOGS_STORAGE_KEY)
  const globalContext = startGlobalContext(hooks, configuration, LOGS_STORAGE_KEY, false)
  startRUMInternalContext(hooks)

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  bufferedDataObservable.unbuffer()
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(configuration, lifeCycle, hooks, getCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      sessionManager
    )
    cleanupTasks.push(() => stopLogsBatch())
  } else {
    startLogsBridge(lifeCycle)
  }

  const internalContext = startInternalContext(sessionManager)

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
