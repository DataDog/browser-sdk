import {
  createInjector,
  canUseEventBridge,
  willSyntheticsInjectRum,
  getConfiguration,
  getInitConfiguration,
} from '@datadog/browser-core'
import {
  type LogsInitConfiguration,
  type LogsConfiguration,
  getLogsConfiguration,
  getLogsInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../rawLogsEvent.types'
import { startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import { startLogsBatch } from '../transport/startLogsBatch'
import { startLogsBridge } from '../transport/startLogsBridge'
import { getBuildLogsCommonContext } from '../domain/commonContext'

export function createLogsInjector(
  logsInitConfiguration: LogsInitConfiguration,
  configuration: LogsConfiguration,
  buildCommonContext: () => CommonContext
) {
  const injector = createInjector()

  injector.override(getConfiguration, () => configuration)
  injector.override(getLogsConfiguration, () => configuration)
  injector.override(getInitConfiguration, () => logsInitConfiguration)
  injector.override(getLogsInitConfiguration, () => logsInitConfiguration)
  injector.override(getBuildLogsCommonContext, () => buildCommonContext)

  if (canUseEventBridge()) {
    injector.override(startLogsSessionManager, startLogsSessionManagerStub)
    injector.override(startLogsBatch, startLogsBridge)
  }

  if (!configuration.sessionStoreStrategyType || willSyntheticsInjectRum()) {
    injector.override(startLogsSessionManager, startLogsSessionManagerStub)
  }

  return injector
}
