import { Batch, combine, Configuration, Context, HttpRequest } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { RumEvent, RumEventCategory } from '../types'
import { RumEventType, RumEventV2 } from '../typesV2'

export function startRumBatch(configuration: Configuration, lifeCycle: LifeCycle) {
  const batch = makeRumBatch(configuration, lifeCycle)

  lifeCycle.subscribe(
    LifeCycleEventType.RUM_EVENT_COLLECTED,
    ({ rumEvent, serverRumEvent }: { rumEvent: RumEvent; serverRumEvent: Context }) => {
      if (rumEvent.evt.category === RumEventCategory.VIEW) {
        batch.upsert(serverRumEvent, rumEvent.view.id)
      } else {
        batch.add(serverRumEvent)
      }
    }
  )

  lifeCycle.subscribe(
    LifeCycleEventType.RUM_EVENT_V2_COLLECTED,
    ({ rumEvent, serverRumEvent }: { rumEvent: RumEventV2; serverRumEvent: Context }) => {
      if (rumEvent.type === RumEventType.VIEW) {
        batch.upsert(serverRumEvent, rumEvent.view.id)
      } else {
        batch.add(serverRumEvent)
      }
    }
  )

  return {
    stop() {
      batch.stop()
    },
  }
}

interface RumBatch {
  add: (message: Context) => void
  stop: () => void
  upsert: (message: Context, key: string) => void
}

function makeRumBatch(configuration: Configuration, lifeCycle: LifeCycle): RumBatch {
  const primaryBatch = createRumBatch(configuration.rumEndpoint, () =>
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
  )

  let replicaBatch: Batch | undefined
  const replica = configuration.replica
  if (replica !== undefined) {
    replicaBatch = createRumBatch(replica.rumEndpoint)
  }

  function createRumBatch(endpointUrl: string, unloadCallback?: () => void) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit, true),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout,
      unloadCallback
    )
  }

  function withReplicaApplicationId(message: Context) {
    const applicationIdOverwrite = configuration.isEnabled('v2_format')
      ? { application: { id: replica!.applicationId } }
      : { application_id: replica!.applicationId }
    return combine(message, applicationIdOverwrite)
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
