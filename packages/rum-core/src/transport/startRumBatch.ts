import type { Context, EndpointBuilder } from '@datadog/browser-core'
import { Batch, combine, HttpRequest } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'

export function startRumBatch(configuration: RumConfiguration, lifeCycle: LifeCycle) {
  const batch = makeRumBatch(configuration, lifeCycle)

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.TELEMETRY_EVENT_COLLECTED, (event) => batch.add(event))

  return {
    stop: () => batch.stop(),
  }
}

interface RumBatch {
  add: (message: Context) => void
  stop: () => void
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

  let stopped = false
  return {
    add: (message: Context) => {
      if (stopped) {
        return
      }
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(withReplicaApplicationId(message))
      }
    },
    stop: () => {
      stopped = true
    },
    upsert: (message: Context, key: string) => {
      if (stopped) {
        return
      }
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(withReplicaApplicationId(message), key)
      }
    },
  }
}
