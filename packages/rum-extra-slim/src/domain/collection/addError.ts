import { combine, isError, sanitize } from '@datadog/browser-core'
import type { ErrorEvent } from '../event'
import { EVENT } from '../event'
import type { TransportManager } from '../transportManager'
import { createHandlingStack, serializeError } from '../../tools/errors'

export function addError(transportManager: TransportManager, error: unknown, context?: unknown) {
  if (!isError(error)) {
    return
  }

  const data: ErrorEvent = {
    type: EVENT.ERROR,
    error: serializeError(error),
  }

  if (context) {
    data.error!.context = combine(data.error?.context, sanitize(context))
  }

  data.error.handlingStack = createHandlingStack()

  transportManager.send(data)
}
