import type { Context, Observable, PageMayExitEvent, RawError } from '@datadog/browser-core'
import { createIdentityEncoder, startBatchWithReplica } from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration.types'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../types/logsEvent.types'
import type { LogsSessionManager } from '../domain/sessionManager.interface'

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: LogsSessionManager
) {
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
    pageMayExitObservable,
    session.expireObservable
  )

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
