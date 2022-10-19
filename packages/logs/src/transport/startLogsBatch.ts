import type { Context, PageExitState, RawError } from '@datadog/browser-core'
import { startBatchWithReplica } from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageExitState: PageExitState
) {
  const batch = startBatchWithReplica(
    configuration,
    configuration.logsEndpointBuilder,
    reportError,
    pageExitState,
    configuration.replica?.logsEndpointBuilder
  )

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })
}
