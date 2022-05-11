import type { Context, EndpointBuilder, TelemetryEvent, Observable } from '@datadog/browser-core'
import { Batch, combine, HttpRequest, isTelemetryReplicationAllowed } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  telemetryEventObservable: Observable<TelemetryEvent & Context>
) {
  const batch = makeRumBatch(configuration, lifeCycle)

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })

  telemetryEventObservable.subscribe((event) => batch.add(event, isTelemetryReplicationAllowed(configuration)))
}

interface RumBatch {
  add: (message: Context, replicated?: boolean) => void
  upsert: (message: Context, key: string) => void
}

function makeRumBatch(configuration: RumConfiguration, lifeCycle: LifeCycle): RumBatch {
  const primaryBatch = createRumBatch(configuration.rumEndpointBuilder, () =>
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
  )

  let replicaBatch: Batch | undefined
  const replica = configuration.replica
  if (replica !== undefined) {
    replicaBatch = createRumBatch(replica.rumEndpointBuilder)
  }

  function createRumBatch(endpointBuilder: EndpointBuilder, unloadCallback?: () => void) {
    return new Batch(
      new HttpRequest(endpointBuilder, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout,
      unloadCallback
    )
  }

  function withReplicaApplicationId(message: Context) {
    return combine(message, { application: { id: replica!.applicationId } })
  }

  return {
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
