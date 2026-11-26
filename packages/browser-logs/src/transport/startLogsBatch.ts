import type { SessionManager } from '@datadog/browser-core'
import type { Context } from '@datadog/js-core/util'
import { createBatch } from '@datadog/browser-core'
import { createEndpointBuilder, createReplicaEndpointBuilder } from '@datadog/js-core/transport'
import type { LogsConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export function startLogsBatch(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  reportError: (message: string) => void,
  sessionManager: SessionManager
) {
  const endpoints = [createEndpointBuilder(configuration, 'logs', __BUILD_ENV__SDK_VERSION__)]
  const replicaEndpoint = createReplicaEndpointBuilder(configuration, 'logs', __BUILD_ENV__SDK_VERSION__)
  if (replicaEndpoint) {
    endpoints.push(replicaEndpoint)
  }

  const batch = createBatch({ endpoints, reportError })
  sessionManager.expireObservable.subscribe(() => batch.forceFlush('session_expire'))

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
