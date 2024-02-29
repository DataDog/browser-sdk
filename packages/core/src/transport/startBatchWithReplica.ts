import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/serialisation/context'
import type { Observable } from '../tools/observable'
import type { PageExitEvent } from '../browser/pageExitObservable'
import type { RawError } from '../domain/error/error.types'
import type { Encoder } from '../tools/encoder'
import { assign } from '../tools/utils/polyfills'
import { Batch } from './batch'
import { createHttpRequest } from './httpRequest'
import { createFlushController } from './flushController'

export interface BatchConfiguration {
  endpoint: EndpointBuilder
  encoder: Encoder
}

interface ReplicaBatchConfiguration<T> extends BatchConfiguration {
  transformMessage?: (message: T) => T
}

interface SpotlightBatchConfiguration<T> extends ReplicaBatchConfiguration<T> {
  contentType?: string
}

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  primary: BatchConfiguration,
  replica: ReplicaBatchConfiguration<T> | undefined,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>,
  spotlightReplica?: SpotlightBatchConfiguration<T>
) {
  const primaryBatch = createBatch(configuration, primary)
  const replicaBatch = replica && createBatch(configuration, replica)
  const spotlightConfiguration = assign({}, configuration, {
    batchMessagesLimit: 1,
    batchBytesLimit: 1024,
    flushTimeout: 1000,
  })
  const spotlightBatch = spotlightReplica && createBatch(spotlightConfiguration, spotlightReplica)

  function createBatch(
    configuration: Configuration,
    batchConfiguration: BatchConfiguration | SpotlightBatchConfiguration<T>
  ) {
    const { endpoint, encoder } = batchConfiguration
    const spotlight = (batchConfiguration as SpotlightBatchConfiguration<T>).contentType

    return new Batch(
      encoder,
      createHttpRequest(configuration, endpoint, configuration.batchBytesLimit, reportError, spotlight),
      createFlushController({
        messagesLimit: configuration.batchMessagesLimit,
        bytesLimit: configuration.batchBytesLimit,
        durationLimit: configuration.flushTimeout,
        pageExitObservable,
        sessionExpireObservable,
      }),
      configuration.messageBytesLimit
    )
  }

  return {
    flushObservable: primaryBatch.flushController.flushObservable,

    add(message: T, replicated = true) {
      primaryBatch.add(message)
      if (replicaBatch && replicated) {
        replicaBatch.add(replica.transformMessage ? replica.transformMessage(message) : message)
      }
      if (spotlightBatch && replicated) {
        spotlightBatch.add(spotlightReplica.transformMessage ? spotlightReplica.transformMessage(message) : message)
      }
    },

    upsert: (message: T, key: string) => {
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(replica.transformMessage ? replica.transformMessage(message) : message, key)
      }
      if (spotlightBatch) {
        spotlightBatch.upsert(
          spotlightReplica.transformMessage ? spotlightReplica.transformMessage(message) : message,
          key
        )
      }
    },

    stop: () => {
      primaryBatch.stop()
      replicaBatch?.stop()
      spotlightBatch?.stop()
    },
  }
}
