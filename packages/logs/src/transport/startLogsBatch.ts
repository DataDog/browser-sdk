import type { Context, Observable, PageMayExitEvent, RawError } from '@datadog/browser-core'
import { createBatch, createFlushController, createHttpRequest, createIdentityEncoder } from '@datadog/browser-core'
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
  const endpoints = [configuration.logsEndpointBuilder]
  if (configuration.replica) {
    endpoints.push(configuration.replica.logsEndpointBuilder)
  }

  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: createHttpRequest(endpoints, configuration.batchBytesLimit, reportError),
    flushController: createFlushController({
      messagesLimit: configuration.batchMessagesLimit,
      bytesLimit: configuration.batchBytesLimit,
      durationLimit: configuration.flushTimeout,
      pageMayExitObservable,
      sessionExpireObservable: session.expireObservable,
    }),
    messageBytesLimit: configuration.messageBytesLimit,
  })

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    batch.add(serverLogsEvent)
  })

  return batch
}
