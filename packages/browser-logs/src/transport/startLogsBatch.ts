import type { Context, Observable, PageMayExitEvent, RawError, SessionManager } from '@datadog/browser-core'
import {
  createBatch,
  createEndpointBuilder,
  createReplicaEndpointBuilder,
  createFlushController,
  createHttpRequest,
  createIdentityEncoder,
} from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionManager: SessionManager
) {
  const endpoints = [createEndpointBuilder(configuration, 'logs')]
  const replicaEndpoint = createReplicaEndpointBuilder(configuration, 'logs')
  if (replicaEndpoint) {
    endpoints.push(replicaEndpoint)
  }

  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: createHttpRequest(endpoints, reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable: sessionManager.expireObservable,
    }),
  })

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
