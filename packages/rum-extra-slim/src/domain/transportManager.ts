import type { SessionManager } from './sessionManager'
import type { Event } from './event'

const BASE_URL = '/'

export type TransportManager = ReturnType<typeof startTransportManager>

export function startTransportManager(sessionManager: SessionManager) {
  const { clientId, contextId } = sessionManager

  function send(data: Event) {
    console.log(`[${data.type}]`, data) // eslint-disable-line no-console

    fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        contextId,
        data,
      }),
    }).catch((e) => {
      console.error('[RUM_XS] Failed to send', e) // eslint-disable-line no-console
    })
  }

  return {
    send,
  }
}
