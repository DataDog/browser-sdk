import type { Context, Observable, PageMayExitEvent, RawError } from '@datadog/browser-core'
import {
  createBatch,
  createEndpointBuilder,
  createFlushController,
  createHttpRequest,
  createIdentityEncoder,
  createReplicaEndpointBuilder,
} from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'
import type { LogsSessionManager } from '../domain/logsSessionManager'

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: LogsSessionManager
) {
  const endpoints = [createEndpointBuilder(configuration, 'logs')]
  if (configuration.replica) {
    endpoints.push(createReplicaEndpointBuilder(configuration, configuration.replica, 'logs'))
  }

  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: createHttpRequest(endpoints, reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable: session.expireObservable,
    }),
  })

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
