import {
  createInjector,
  createPageExitObservable,
  canUseEventBridge,
  willSyntheticsInjectRum,
} from '@datadog/browser-core'
import type { ComponentId, Component } from '@datadog/browser-core'
import { LifeCycle } from '../domain/lifeCycle'
import type { LogsInitConfiguration, LogsConfiguration } from '../domain/configuration'
import type { CommonContext } from '../rawLogsEvent.types'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import { startLogsAssembly } from '../domain/assembly'
import { startNetworkErrorCollection } from '../domain/networkError/networkErrorCollection'
import { startRuntimeErrorCollection } from '../domain/runtimeError/runtimeErrorCollection'
import { startConsoleCollection } from '../domain/console/consoleCollection'
import { startReportCollection } from '../domain/report/reportCollection'
import { startLoggerCollection } from '../domain/logger/loggerCollection'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import { startInternalContext } from '../domain/internalContext'
import { startLogsTelemetry } from '../domain/logsTelemetry'
import { startReportError } from '../domain/reportError'
import { LogsComponents } from './logsComponents'

export function createLogsInjector(
  initConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  buildCommonContext: () => CommonContext
) {
  const injector = createInjector()

  ;(
    [
      [LogsComponents.LifeCycle, new LifeCycle()],
      [LogsComponents.InitConfiguration, initConfiguration],
      [LogsComponents.Configuration, configuration],
      [LogsComponents.BuildCommonContext, buildCommonContext],
      [LogsComponents.PageExitObservable, createPageExitObservable(configuration)],
    ] as Array<[ComponentId, Component]>
  ).forEach(([componentId, component]) => injector.define(componentId, component))

  injector.register(
    startLogsSessionManager,
    startLogsTelemetry,
    startNetworkErrorCollection,
    startRuntimeErrorCollection,
    startConsoleCollection,
    startReportCollection,
    startLoggerCollection,
    startLogsAssembly,
    startLogsBatch,
    startInternalContext,
    startReportError
  )

  if (canUseEventBridge()) {
    injector.register(startLogsBridge, startLogsSessionManagerStub)
  }

  if (!configuration.sessionStoreStrategyType || willSyntheticsInjectRum()) {
    injector.register(startLogsSessionManagerStub)
  }

  return injector
}
