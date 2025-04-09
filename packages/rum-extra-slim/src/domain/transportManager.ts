import { dateNow, monitorError } from '@datadog/browser-core'
import type { SessionManager } from './sessionManager'
import type { Event } from './event'

const BASE_URL = 'https://d1vqwqwipxy36n.cloudfront.net'

export type TransportManager = ReturnType<typeof startTransportManager>

export function startTransportManager(sessionManager: SessionManager) {
  function send(data: Event) {
    console.log(`[${data.type}]`, data) // eslint-disable-line no-console

    const { clientId, contextId } = sessionManager

    fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        contextId,
        timestamp: dateNow(),
        data,
      }),
    }).catch((e) => {
      // @ts-expect-error wrong types in vscode?
      monitorError(new Error('[RUM XS] Failed to send event', { cause: e }))
    })
  }

  return {
    baseUrl: BASE_URL,
    send,
  }
}
