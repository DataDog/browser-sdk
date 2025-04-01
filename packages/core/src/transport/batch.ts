import { DOCS_TROUBLESHOOTING, MORE_DETAILS, display } from '../tools/display'
import type { Context } from '../tools/serialisation/context'
import { objectValues } from '../tools/utils/polyfills'
import { isPageExitReason } from '../browser/pageMayExitObservable'
import { jsonStringify } from '../tools/serialisation/jsonStringify'
import type { Encoder, EncoderResult } from '../tools/encoder'
import { computeBytesCount } from '../tools/utils/byteUtils'
import type { HttpRequest, Payload } from './httpRequest'
import type { FlushController, FlushEvent } from './flushController'

export interface Batch {
  flushController: FlushController
  add: (message: Context) => void
  upsert: (message: Context, key: string) => void
  stop: () => void
}

export function createBatch({
  encoder,
  request,
  flushController,
  messageBytesLimit,
}: {
  encoder: Encoder
  request: HttpRequest
  flushController: FlushController
  messageBytesLimit: number
}): Batch {
  let upsertBuffer: { [key: string]: string } = {}
  const flushSubscription = flushController.flushObservable.subscribe((event) => flush(event))

  function push(serializedMessage: string, estimatedMessageBytesCount: number, key?: string) {
    flushController.notifyBeforeAddMessage(estimatedMessageBytesCount)

    if (key !== undefined) {
      upsertBuffer[key] = serializedMessage
      flushController.notifyAfterAddMessage()
    } else {
      encoder.write(encoder.isEmpty ? serializedMessage : `\n${serializedMessage}`, (realMessageBytesCount) => {
        flushController.notifyAfterAddMessage(realMessageBytesCount - estimatedMessageBytesCount)
      })
    }
  }

  function hasMessageFor(key?: string): key is string {
    return key !== undefined && upsertBuffer[key] !== undefined
  }

  function remove(key: string) {
    const removedMessage = upsertBuffer[key]
    delete upsertBuffer[key]
    const messageBytesCount = encoder.estimateEncodedBytesCount(removedMessage)
    flushController.notifyAfterRemoveMessage(messageBytesCount)
  }

  function addOrUpdate(message: Context, key?: string) {
    const serializedMessage = jsonStringify(message)!

    const estimatedMessageBytesCount = encoder.estimateEncodedBytesCount(serializedMessage)

    if (estimatedMessageBytesCount >= messageBytesLimit) {
      display.warn(
        `Discarded a message whose size was bigger than the maximum allowed size ${messageBytesLimit}KB. ${MORE_DETAILS} ${DOCS_TROUBLESHOOTING}/#technical-limitations`
      )
      return
    }

    if (hasMessageFor(key)) {
      remove(key)
    }

    push(serializedMessage, estimatedMessageBytesCount, key)
  }

  function flush(event: FlushEvent) {
    const upsertMessages = objectValues(upsertBuffer).join('\n')
    upsertBuffer = {}

    const pageMightExit = isPageExitReason(event.reason)
    const send = pageMightExit ? request.sendOnExit : request.send

    if (
      pageMightExit &&
      // Note: checking that the encoder is async is not strictly needed, but it's an optimization:
      // if the encoder is async we need to send two requests in some cases (one for encoded data
      // and the other for non-encoded data). But if it's not async, we don't have to worry about
      // it and always send a single request.
      encoder.isAsync
    ) {
      const encoderResult = encoder.finishSync()

      // Send encoded messages
      if (encoderResult.outputBytesCount) {
        send(formatPayloadFromEncoder(encoderResult))
      }

      // Send messages that are not yet encoded at this point
      const pendingMessages = [encoderResult.pendingData, upsertMessages].filter(Boolean).join('\n')
      if (pendingMessages) {
        send({
          data: pendingMessages,
          bytesCount: computeBytesCount(pendingMessages),
        })
      }
    } else {
      if (upsertMessages) {
        encoder.write(encoder.isEmpty ? upsertMessages : `\n${upsertMessages}`)
      }
      encoder.finish((encoderResult) => {
        send(formatPayloadFromEncoder(encoderResult))
      })
    }
  }

  return {
    flushController,
    add: addOrUpdate,
    upsert: addOrUpdate,
    stop: flushSubscription.unsubscribe,
  }
}

function formatPayloadFromEncoder(encoderResult: EncoderResult): Payload {
  let data: string | Blob
  if (typeof encoderResult.output === 'string') {
    data = encoderResult.output
  } else {
    data = new Blob([encoderResult.output], {
      // This will set the 'Content-Type: text/plain' header. Reasoning:
      // * The intake rejects the request if there is no content type.
      // * The browser will issue CORS preflight requests if we set it to 'application/json', which
      // could induce higher intake load (and maybe has other impacts).
      // * Also it's not quite JSON, since we are concatenating multiple JSON objects separated by
      // new lines.
      type: 'text/plain',
    })
  }

  return {
    data,
    bytesCount: encoderResult.outputBytesCount,
    encoding: encoderResult.encoding,
  }
}
