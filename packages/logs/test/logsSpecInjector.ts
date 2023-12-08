import { stubEndpointBuilder, registerCleanupTask } from '@datadog/browser-core/test'
import type { Injector } from '@datadog/browser-core'
import { createLogsInjector } from '../src/boot/logsInjector'
import type { LogsConfiguration } from '../src/domain/configuration'
import { validateAndBuildLogsConfiguration } from '../src/domain/configuration'
import type { RawLogsEventCollectedData, LifeCycle } from '../src/domain/lifeCycle'
import { LifeCycleEventType } from '../src/domain/lifeCycle'
import { LogsComponents } from '../src/boot/logsComponents'

export enum LogsSpecComponents {
  RawLogsEvents = 1000,
}

export interface LogsSpecInjector extends Injector {
  withConfiguration(configuration: Partial<LogsConfiguration>): void
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
  const injector = createLogsInjector(initConfiguration, baseConfiguration, () => commonContext)
  injector.register(startRawLogEvents)
  registerCleanupTask(() => injector.stop())

  return {
    get: injector.get,
    define: injector.define,
    register: injector.register,
    stop: injector.stop,
    withConfiguration: (configuration: Partial<LogsConfiguration>) =>
      injector.define(LogsComponents.Configuration, {
        ...injector.get<LogsConfiguration>(LogsComponents.Configuration),
        ...configuration,
      }),
  }
}

function startRawLogEvents(lifeCycle: LifeCycle) {
  const rawLogsEvents: RawLogsEventCollectedData[] = []
  lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) => rawLogsEvents.push(rawLogsEvent))
  return rawLogsEvents
}
/* eslint-disable local-rules/disallow-side-effects */
startRawLogEvents.$id = LogsSpecComponents.RawLogsEvents
startRawLogEvents.$deps = [LogsComponents.LifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
