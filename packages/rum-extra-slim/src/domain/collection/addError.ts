import { combine, sanitize } from '@datadog/browser-core'
import type { ErrorEvent } from '../event'
import { EVENT } from '../event'
import type { TransportManager } from '../transportManager'

export function addError(transportManager: TransportManager, error?: unknown, context?: unknown) {
  const data: ErrorEvent = {
    type: EVENT.ERROR,
  }

  if (error) {
    const err = error as Error & Record<string, unknown>

    data.error = {
      stack: err.stack,
      message: err.message,
      handlingStack: createHandlingStack(),
      fingerprint: sanitize(err.dd_fingerprint),
      context: combine(sanitize(err.dd_context), sanitize(context)),
    }
  }

  transportManager.send(data)
}

function createHandlingStack() {
  return new Error().stack
}
