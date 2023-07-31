import type {
  Context,
  EndpointBuilder,
  TelemetryEvent,
  Observable,
  RawError,
  PageExitEvent,
  FlushEvent,
} from '@datadog/browser-core'
import {
  createFlushController,
  Batch,
  combine,
  createHttpRequest,
  isTelemetryReplicationAllowed,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  telemetryEventObservable: Observable<TelemetryEvent & Context>,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>
) {
  const batch = makeRumBatch(configuration, reportError, pageExitObservable, sessionExpireObservable)

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })

  telemetryEventObservable.subscribe((event) => batch.add(event, isTelemetryReplicationAllowed(configuration)))

  return batch
}

export interface RumBatch {
  flushObservable: Observable<FlushEvent>
  add: (message: Context, replicated?: boolean) => void
  upsert: (message: Context, key: string) => void
}

function makeRumBatch(
  configuration: RumConfiguration,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>
): RumBatch {
  const { batch: primaryBatch, flushController: primaryFlushController } = createRumBatch(
    configuration.rumEndpointBuilder
  )
  let replicaBatch: Batch | undefined
  const replica = configuration.replica
  if (replica !== undefined) {
    replicaBatch = createRumBatch(replica.rumEndpointBuilder).batch
  }

  function createRumBatch(endpointBuilder: EndpointBuilder) {
    const flushController = createFlushController({
      messagesLimit: configuration.batchMessagesLimit,
      bytesLimit: configuration.batchBytesLimit,
      durationLimit: configuration.flushTimeout,
      pageExitObservable,
      sessionExpireObservable,
    })

    const batch = new Batch(
      createHttpRequest(configuration, endpointBuilder, configuration.batchBytesLimit, reportError),
      flushController,
      configuration.messageBytesLimit
    )

    return {
      batch,
      flushController,
    }
  }

  function withReplicaApplicationId(message: Context) {
    return combine(message, { application: { id: replica!.applicationId } })
  }

  return {
    flushObservable: primaryFlushController.flushObservable,
    add: (message: Context, replicated = true) => {
      primaryBatch.add(message)
      if (replicaBatch && replicated) {
        replicaBatch.add(withReplicaApplicationId(message))
      }
    },
    upsert: (message: Context, key: string) => {
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(withReplicaApplicationId(message), key)
      }
    },
  }
}
