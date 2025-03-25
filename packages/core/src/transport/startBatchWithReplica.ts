import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/serialisation/context'
import type { Observable } from '../tools/observable'
import type { PageMayExitEvent } from '../browser/pageMayExitObservable'
import type { RawError } from '../domain/error/error.types'
import type { Encoder } from '../tools/encoder'
import { createBatch } from './batch'
import { createHttpRequest } from './httpRequest'
import { createFlushController } from './flushController'

export interface BatchConfiguration {
  endpoint: EndpointBuilder
  encoder: Encoder
}

interface ReplicaBatchConfiguration<T> extends BatchConfiguration {
  transformMessage?: (message: T) => T
}

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  primary: BatchConfiguration,
  replica: ReplicaBatchConfiguration<T> | undefined,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  batchFactoryImp = createBatch
) {
  const primaryBatch = createBatchFromConfig(configuration, primary)
  const replicaBatch = replica && createBatchFromConfig(configuration, replica)

  function createBatchFromConfig(configuration: Configuration, { endpoint, encoder }: BatchConfiguration) {
    return batchFactoryImp({
      encoder,
      request: createHttpRequest(endpoint, configuration.batchBytesLimit, reportError),
      flushController: createFlushController({
        messagesLimit: configuration.batchMessagesLimit,
        bytesLimit: configuration.batchBytesLimit,
        durationLimit: configuration.flushTimeout,
        pageMayExitObservable,
        sessionExpireObservable,
      }),
      messageBytesLimit: configuration.messageBytesLimit,
    })
  }

  return {
    flushObservable: primaryBatch.flushController.flushObservable,

    add(message: T, replicated = true) {
      primaryBatch.add(message)
      if (replicaBatch && replicated) {
        replicaBatch.add(replica.transformMessage ? replica.transformMessage(message) : message)
      }
    },

    upsert: (message: T, key: string) => {
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(replica.transformMessage ? replica.transformMessage(message) : message, key)
      }
    },

    stop: () => {
      primaryBatch.stop()
      if (replicaBatch) {
        replicaBatch.stop()
      }
    },
  }
}
