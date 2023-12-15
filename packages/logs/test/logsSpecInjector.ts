import { stubEndpointBuilder, registerCleanupTask } from '@datadog/browser-core/test'
import {
  createInjector,
  type Component,
  type Injector,
  getConfiguration,
  getInitConfiguration,
} from '@datadog/browser-core'
import type { LogsConfiguration } from '../src/domain/configuration'
import {
  getLogsConfiguration,
  getLogsInitConfiguration,
  validateAndBuildLogsConfiguration,
} from '../src/domain/configuration'
import type { RawLogsEventCollectedData, LifeCycle } from '../src/domain/lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from '../src/domain/lifeCycle'
import { getBuildLogsCommonContext } from '../src/domain/commonContext'

export interface LogsSpecInjector extends Injector {
  withConfiguration(configuration: Partial<LogsConfiguration>): LogsSpecInjector
}

export function createLogsSpecInjector(): LogsSpecInjector {
  const initConfiguration = { clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 }
  const baseConfiguration = {
    ...validateAndBuildLogsConfiguration(initConfiguration)!,
    logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
    batchMessagesLimit: 1,
  }
  const commonContext = {
    view: { referrer: 'common_referrer', url: 'common_url' },
    context: {},
    user: {},
  }

  const injector = createInjector()
  registerCleanupTask(() => injector.stop())

  injector.override(getConfiguration, () => baseConfiguration)
  injector.override(getLogsConfiguration, () => baseConfiguration)
  injector.override(getInitConfiguration, () => initConfiguration)
  injector.override(getLogsInitConfiguration, () => initConfiguration)
  injector.override(getBuildLogsCommonContext, () => () => commonContext)

  const logsSpecInjector = {
    ...injector,
    withConfiguration: (configuration: Partial<LogsConfiguration>) => {
      injector.override(getConfiguration, () => ({ ...baseConfiguration, ...configuration }))
      injector.override(getLogsConfiguration, () => ({ ...baseConfiguration, ...configuration }))
      return logsSpecInjector
    },
  }

  return logsSpecInjector
}

export const startRawLogEvents: Component<RawLogsEventCollectedData[], [LifeCycle]> = (lifeCycle) => {
  const rawLogsEvents: RawLogsEventCollectedData[] = []
  lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) => rawLogsEvents.push(rawLogsEvent))
  return rawLogsEvents
}
/* eslint-disable local-rules/disallow-side-effects */
startRawLogEvents.$deps = [startLogsLifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
