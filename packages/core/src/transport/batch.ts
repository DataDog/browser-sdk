import { DOCS_ORIGIN, display } from '../tools/display'
import type { Context } from '../tools/serialisation/context'
import { objectValues } from '../tools/utils/polyfills'
import { isPageExitReason } from '../browser/pageExitObservable'
import { jsonStringify } from '../tools/serialisation/jsonStringify'
import type { Subscription } from '../tools/observable'
import type { Encoder, EncoderResult } from '../tools/encoder'
import { computeBytesCount } from '../tools/utils/byteUtils'
import type { HttpRequest, Payload } from './httpRequest'
import type { FlushController, FlushEvent } from './flushController'

export class Batch {
  private upsertBuffer: { [key: string]: string } = {}
  private flushSubscription: Subscription

  constructor(
    private encoder: Encoder,
    private request: HttpRequest,
    public flushController: FlushController,
    private messageBytesLimit: number
  ) {
    this.flushSubscription = this.flushController.flushObservable.subscribe((event) => this.flush(event))
  }

  add(message: Context) {
    this.addOrUpdate(message)
  }

  upsert(message: Context, key: string) {
    this.addOrUpdate(message, key)
  }

  stop() {
    this.flushSubscription.unsubscribe()
  }

  private flush(event: FlushEvent) {
    const upsertMessages = objectValues(this.upsertBuffer).join('\n')
    this.upsertBuffer = {}

    const isPageExit = isPageExitReason(event.reason)
    const send = isPageExit ? this.request.sendOnExit : this.request.send

    if (
      isPageExit &&
      // Note: checking that the encoder is async is not strictly needed, but it's an optimization:
      // if the encoder is async we need to send two requests in some cases (one for encoded data
      // and the other for non-encoded data). But if it's not async, we don't have to worry about
      // it and always send a single request.
      this.encoder.isAsync
    ) {
      const encoderResult = this.encoder.finishSync()

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
        this.encoder.write(this.encoder.isEmpty ? upsertMessages : `\n${upsertMessages}`)
      }
      this.encoder.finish((encoderResult) => {
        send(formatPayloadFromEncoder(encoderResult))
      })
    }
  }

  private addOrUpdate(message: Context, key?: string) {
    const serializedMessage = jsonStringify(message)!

    const estimatedMessageBytesCount = this.encoder.estimateEncodedBytesCount(serializedMessage)

    if (estimatedMessageBytesCount >= this.messageBytesLimit) {
      display.warn(
        `Discarded a message whose size was bigger than the maximum allowed size ${this.messageBytesLimit}KB. More details: ${DOCS_ORIGIN}/real_user_monitoring/browser/troubleshooting/#technical-limitations`
      )
      return
    }

    if (this.hasMessageFor(key)) {
      this.remove(key)
    }

    this.push(serializedMessage, estimatedMessageBytesCount, key)
  }

  private push(serializedMessage: string, estimatedMessageBytesCount: number, key?: string) {
    this.flushController.notifyBeforeAddMessage(estimatedMessageBytesCount)

    if (key !== undefined) {
      this.upsertBuffer[key] = serializedMessage
      this.flushController.notifyAfterAddMessage()
    } else {
      this.encoder.write(
        this.encoder.isEmpty ? serializedMessage : `\n${serializedMessage}`,
        (realMessageBytesCount) => {
          this.flushController.notifyAfterAddMessage(realMessageBytesCount - estimatedMessageBytesCount)
        }
      )
    }
  }

  private remove(key: string) {
    const removedMessage = this.upsertBuffer[key]
    delete this.upsertBuffer[key]
    const messageBytesCount = this.encoder.estimateEncodedBytesCount(removedMessage)
    this.flushController.notifyAfterRemoveMessage(messageBytesCount)
  }

  private hasMessageFor(key?: string): key is string {
    return key !== undefined && this.upsertBuffer[key] !== undefined
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
