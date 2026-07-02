import type { Uint8ArrayBuffer, Encoder, EncoderResult, DeflateEncoderStreamId, Context } from '@datadog/browser-core'
import { addTelemetryDebug, createHttpRequest, jsonStringify, objectEntries, ErrorSource } from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import { createEndpointBuilder } from '@datadog/js-core/transport'
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
  const reportError = (message: string) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
      error: { message, source: ErrorSource.AGENT, startClocks: clocksNow() },
    })

    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': message })
  }

  const httpRequest = createHttpRequest([createEndpointBuilder(configuration, 'profile')], reportError)

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
