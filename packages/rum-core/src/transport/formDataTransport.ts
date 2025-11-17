import type {
  Uint8ArrayBuffer,
  Encoder,
  EncoderResult,
  DeflateEncoderStreamId,
  RawError,
  Context,
} from '@datadog/browser-core'
import { addTelemetryDebug, createHttpRequest, jsonStringify, objectEntries } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'

/**
 * transport payload consist of an event and one or more attachments
 */
export interface TransportPayload {
  event: Context
  [key: string]: Context
}

export interface Transport<T extends TransportPayload> {
  send: (data: T) => Promise<void>
}

export function createFormDataTransport<T extends TransportPayload>(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  streamId: DeflateEncoderStreamId
) {
  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })

    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const httpRequest = createHttpRequest([configuration.profilingEndpointBuilder], reportError)

  const encoder = createEncoder(streamId)

  return {
    async send({ event, ...attachments }: T) {
      const formData = new FormData()
      const serializedEvent = jsonStringify(event)

      if (!serializedEvent) {
        throw new Error('Failed to serialize event')
      }

      formData.append('event', new Blob([serializedEvent], { type: 'application/json' }), 'event.json')

      let bytesCount = serializedEvent.length

      for (const [key, value] of objectEntries(attachments as Record<string, Context>)) {
        const serializedValue = jsonStringify(value)

        if (!serializedValue) {
          throw new Error('Failed to serialize attachment')
        }

        const result = await encode(encoder, serializedValue)

        bytesCount += result.outputBytesCount
        formData.append(key, new Blob([result.output]), key)
      }

      httpRequest.send({
        data: formData,
        bytesCount,
      })
    },
  }
}

function encode<T extends string | Uint8ArrayBuffer>(encoder: Encoder<T>, data: string): Promise<EncoderResult<T>> {
  return new Promise((resolve) => {
    encoder.write(data)

    encoder.finish((encoderResult) => {
      resolve(encoderResult)
    })
  })
}
