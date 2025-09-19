import type {
  Uint8ArrayBuffer,
  Encoder,
  EncoderResult,
  DeflateEncoderStreamId,
  RawError,
  Payload,
  Context,
} from '@datadog/browser-core'
import { addTelemetryDebug, createHttpRequest, jsonStringify, objectEntries } from '@datadog/browser-core'
import type { RumConfiguration, LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'

export interface TransportPayload {
  event: Context
  [key: string]: Context
}

export interface Transport<T extends TransportPayload> {
  send: (data: T) => Promise<void>
}

export function createTransport<T extends TransportPayload>(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  streamId: DeflateEncoderStreamId
) {
  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const httpRequest = createHttpRequest(
    [configuration.profilingEndpointBuilder],
    configuration.batchBytesLimit,
    reportError
  )

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

      const payload: Payload = {
        data: formData,
        bytesCount,
      }

      httpRequest.send(payload)
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
