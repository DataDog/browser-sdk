import type { Context, Observable, PageExitEvent, RawError } from '@datadog/browser-core'
import { startBatchWithReplica } from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>
) {
  const batch = startBatchWithReplica(
    configuration,
    configuration.logsEndpointBuilder,
    reportError,
    pageExitObservable,
    sessionExpireObservable,
    configuration.replica?.logsEndpointBuilder
  )

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })
}
