import { sendToExtension } from '@datadog/browser-core'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { startLoggerCollection } from '../domain/logger/loggerCollection'
import type { CommonContext } from '../rawLogsEvent.types'
import type { startInternalContext } from '../domain/internalContext'
import { LogsComponents } from './logsComponents'
import { createLogsInjector } from './logsInjector'

export function startLogs(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  buildCommonContext: () => CommonContext
) {
  const injector = createLogsInjector(initConfiguration, configuration, buildCommonContext)

  ;[
    LogsComponents.NetworkCollection,
    LogsComponents.RuntimeErrorCollection,
    LogsComponents.ConsoleCollection,
    LogsComponents.ReportCollection,
    LogsComponents.LoggerCollection,
    LogsComponents.LogsAssembly,
    LogsComponents.LogsTransport,
    LogsComponents.Telemetry,
    LogsComponents.InternalContext,
  ].forEach((componentId) => injector.get(componentId))

  const lifeCycle = injector.get<LifeCycle>(LogsComponents.LifeCycle)
  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (log) => sendToExtension('logs', log))

  return {
    handleLog: injector.get<ReturnType<typeof startLoggerCollection>>(LogsComponents.LoggerCollection).handleLog,
    getInternalContext: injector.get<ReturnType<typeof startInternalContext>>(LogsComponents.InternalContext).get,
    stop: injector.stop,
  }
}
