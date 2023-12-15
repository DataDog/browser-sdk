import { sendToExtension } from '@datadog/browser-core'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { LifeCycleEventType, startLogsLifeCycle } from '../domain/lifeCycle'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import type { CommonContext } from '../rawLogsEvent.types'
import { startInternalContext } from '../domain/internalContext'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startLogsAssembly } from '../domain/assembly'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsTelemetry } from '../domain/logsTelemetry'
import { createLogsInjector } from './logsInjector'

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  buildCommonContext: () => CommonContext
) {
  const injector = createLogsInjector(initConfiguration, configuration, buildCommonContext)

  injector.run(startNetworkErrorCollection)
  injector.run(startRuntimeErrorCollection)
  injector.run(startConsoleCollection)
  injector.run(startReportCollection)
  const loggerCollection = injector.run(startLoggerCollection)
  injector.run(startLogsAssembly)
  injector.run(startLogsBatch)
  injector.run(startLogsTelemetry)
  const internalContext = injector.run(startInternalContext)

  // TODO this could probably be moved in a component
  const lifeCycle = injector.get(startLogsLifeCycle)
  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  return {
    handleLog: loggerCollection.handleLog,
    getInternalContext: internalContext.get,
    stop: injector.stop,
  }
}
