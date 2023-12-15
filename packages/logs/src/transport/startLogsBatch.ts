import type { Component, Context, Observable, PageExitEvent, RawError } from '@datadog/browser-core'
import { createIdentityEncoder, createPageExitObservable, startBatchWithReplica } from '@datadog/browser-core'
import { getLogsConfiguration, type LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'
import { startLogsSessionManager, type LogsSessionManager } from '../domain/logsSessionManager'
import { startReportError } from '../domain/reportError'

export const startLogsBatch: Component<
  void,
  [LogsConfiguration, LifeCycle, (error: RawError) => void, Observable<PageExitEvent>, LogsSessionManager]
> = (configuration, lifeCycle, reportError, pageExitObservable, session) => {
  const batch = startBatchWithReplica(
    configuration,
    {
      endpoint: configuration.logsEndpointBuilder,
      encoder: createIdentityEncoder(),
    },
    configuration.replica && {
      endpoint: configuration.replica.logsEndpointBuilder,
      encoder: createIdentityEncoder(),
    },
    reportError,
    pageExitObservable,
    session.expireObservable
  )

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
/* eslint-disable local-rules/disallow-side-effects */
startLogsBatch.$deps = [
  getLogsConfiguration,
  startLogsLifeCycle,
  startReportError,
  createPageExitObservable,
  startLogsSessionManager,
]
/* eslint-enable local-rules/disallow-side-effects */
