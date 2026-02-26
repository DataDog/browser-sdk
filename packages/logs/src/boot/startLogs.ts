import type { TrackingConsentState, BufferedObservable, BufferedData } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
  startAccountContext,
  startGlobalContext,
  startUserContext,
<<<<<<< HEAD
  startTabContext,
=======
  getRelativeTime,
>>>>>>> b5df58311 (✨ Migrate Logs package to Pipeline architecture)
} from '@datadog/browser-core'
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
import { startRUMInternalContext } from '../domain/contexts/rumInternalContext'
import { startSessionContext } from '../domain/contexts/sessionContext'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'
import { createLogsPipeline } from '../domain/pipeline/createLogsPipeline'
import { createAssemblyDecoratorFactory } from '../domain/pipeline/assemblyDecoratorFactory'

const LOGS_STORAGE_KEY = 'logs'

export type StartLogs = typeof startLogs
export type StartLogsResult = ReturnType<StartLogs>

export function startLogs(
  configuration: LogsConfiguration,
  getCommonContext: () => CommonContext,

  // `startLogs` and its subcomponents assume tracking consent is granted initially and starts
  // collecting logs unconditionally. As such, `startLogs` should be called with a
  // `trackingConsentState` set to "granted".
  trackingConsentState: TrackingConsentState,
  bufferedDataObservable: BufferedObservable<BufferedData>,
  hooks: Hooks
) {
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  const reportError = startReportError(lifeCycle)
  const pageMayExitObservable = createPageMayExitObservable(configuration)

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
  startTabContext(hooks)

  startNetworkErrorCollection(configuration, lifeCycle)
  startRuntimeErrorCollection(configuration, lifeCycle, bufferedDataObservable)
  bufferedDataObservable.unbuffer()
  startConsoleCollection(configuration, lifeCycle)
  startReportCollection(configuration, lifeCycle)
  const { handleLog } = startLoggerCollection(lifeCycle)

  startLogsAssembly(configuration, lifeCycle, hooks, getCommonContext, reportError)

  // Pipeline (additive, runs in parallel with existing lifeCycle path)
  const pipeline = createLogsPipeline()
  pipeline.decorate(
    'observation',
    createAssemblyDecoratorFactory(configuration, hooks, getCommonContext, reportError)
  )
  pipeline.seal()

  // Wire all producers to also publish to the pipeline (additive path)
  lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEventData) => {
    pipeline.publish('observation', {
      type: 'log',
      startTime: getRelativeTime(rawLogsEventData.rawLogsEvent.date),
      data: rawLogsEventData,
    })
  })

  if (!canUseEventBridge()) {
    const batch = startLogsBatch(configuration, lifeCycle, reportError, pageMayExitObservable, session)
    // TODO Task 13: Switch to pipeline-only path and remove lifeCycle assembly.
    // When old lifeCycle path is removed, subscribe pipeline to batch instead:
    // pipeline.subscribe('observation', (enriched) => { batch.add(logsToServerFormat(enriched as any)) })
    cleanupTasks.push(() => batch.stop())
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
