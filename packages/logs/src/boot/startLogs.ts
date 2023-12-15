import type { Component, Injector } from '@datadog/browser-core'
import { canUseEventBridge, getInjector, sendToExtension, willSyntheticsInjectRum } from '@datadog/browser-core'
import { getLogsConfiguration } from '../domain/configuration'
import type { LogsConfiguration } from '../domain/configuration'
import { LifeCycleEventType, startLogsLifeCycle } from '../domain/lifeCycle'
import type { LoggerCollection } from '../domain/logger/loggerCollection'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import type { InternalContext } from '../domain/internalContext'
import { startInternalContext } from '../domain/internalContext'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startLogsAssembly } from '../domain/assembly'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsTelemetry } from '../domain/logsTelemetry'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import { startLogsBridge } from '../transport/startLogsBridge'

export interface StartLogsResult {
  handleLog: LoggerCollection['handleLog']
  getInternalContext: (startTime?: number) => InternalContext | undefined
}

export const startLogs: Component<StartLogsResult, [LogsConfiguration, Injector]> = (configuration, injector) => {
  if (canUseEventBridge()) {
    injector.override(startLogsSessionManager, startLogsSessionManagerStub)
    injector.override(startLogsBatch, startLogsBridge)
  }

  if (!configuration.sessionStoreStrategyType || willSyntheticsInjectRum()) {
    injector.override(startLogsSessionManager, startLogsSessionManagerStub)
  }

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
  }
}

// eslint-disable-next-line local-rules/disallow-side-effects
startLogs.$deps = [getLogsConfiguration, getInjector]
