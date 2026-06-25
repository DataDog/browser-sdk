import type { BufferedObservable, BufferedData, SessionManager } from '@datadog/browser-core'
import {
  sendToExtension,
  canUseEventBridge,
  startAccountContext,
  startGlobalContext,
  startUserContext,
  startTabContext,
} from '@datadog/browser-core'
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
  sessionManager: SessionManager,
  getCommonContext: () => CommonContext,
  bufferedDataObservable: BufferedObservable<BufferedData>,
  hooks: Hooks
) {
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)

  // Start user and account context first to allow overrides from global context
  const assembleHook = hooks.assemble
  startSessionContext(assembleHook, configuration, sessionManager)
  const accountContext = startAccountContext(assembleHook, configuration, LOGS_STORAGE_KEY)
  const userContext = startUserContext(assembleHook, configuration, sessionManager, LOGS_STORAGE_KEY)
  const globalContext = startGlobalContext(assembleHook, configuration, LOGS_STORAGE_KEY, false)
  startRUMInternalContext(hooks)
  startTabContext(assembleHook)

  startNetworkErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  startRuntimeErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  startConsoleCollection(configuration, lifeCycle, bufferedDataObservable)
  bufferedDataObservable.unbuffer()
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(configuration, lifeCycle, assembleHook, getCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopLogsBatch } = startLogsBatch(configuration, lifeCycle, reportError, sessionManager)
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
