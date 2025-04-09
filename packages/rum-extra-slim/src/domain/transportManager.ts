import type { Configuration, Context, Duration, Payload } from '@datadog/browser-core'
import {
  createFlushController,
  createIdentityEncoder,
  createPageMayExitObservable,
  dateNow,
  monitorError,
  Observable,
  ONE_KIBI_BYTE,
  ONE_SECOND,
} from '@datadog/browser-core'
import { createBatch } from '@datadog/browser-core/src/transport/batch'
import type { SessionManager } from './sessionManager'
import type { BrowserEvent } from './event'

const BASE_URL = 'https://d1vqwqwipxy36n.cloudfront.net'

// Flush controller config
const MESSAGE_LIMIT = 50
const BYTES_LIMIT = 16 * ONE_KIBI_BYTE
const DURATION_LIMIT = (30 * ONE_SECOND) as Duration

// Batch config
const MESSAGE_BYTES_LIMIT = 256 * ONE_KIBI_BYTE

export type TransportManager = ReturnType<typeof startTransportManager>

function sendBatch(payload: Payload) {
  fetch(`${BASE_URL}`, {
    method: 'POST',
    body: payload.data,
  }).catch((e) => {
    // @ts-expect-error wrong types in vscode?
    monitorError(new Error('[RUM XS] Failed to send event', { cause: e }))
  })
}

export function startTransportManager(sessionManager: SessionManager) {
  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: {
      send: sendBatch,
      sendOnExit: sendBatch,
    },
    flushController: createFlushController({
      messagesLimit: MESSAGE_LIMIT,
      bytesLimit: BYTES_LIMIT,
      durationLimit: DURATION_LIMIT,
      pageMayExitObservable: createPageMayExitObservable({} as Configuration),
      sessionExpireObservable: new Observable<void>(() => () => void {}),
    }),
    messageBytesLimit: MESSAGE_BYTES_LIMIT,
  })

  function send(data: BrowserEvent) {
    const { clientId, contextId } = sessionManager

    batch.add({
      clientId,
      contextId,
      timestamp: dateNow(),
      data,
    } as Context)
  }

  return {
    baseUrl: BASE_URL,
    send,
  }
}
