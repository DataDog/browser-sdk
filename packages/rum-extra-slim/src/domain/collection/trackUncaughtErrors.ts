import { instrumentMethod } from '@datadog/browser-core'
import { EVENT, type ErrorEvent } from '../event'
import type { TransportManager } from '../transportManager'
import { isError, serializeError } from '../../tools/errors'

type Stoppable = { stop: () => void }

export function trackUncaughtErrors(transportManager: TransportManager) {
  function onError({
    message,
    source,
    lineno,
    colno,
    error,
  }: {
    message?: string | Event
    source?: string
    lineno?: number
    colno?: number
    error?: unknown
  }): void {
    if (!isError(error)) {
      return
    }

    const data: ErrorEvent = {
      type: EVENT.ERROR,
      message,
      source,
      lineno,
      colno,
      error: serializeError(error),
    }

    transportManager.send(data)
  }

  const subscriptions: Stoppable[] = []

  subscriptions.push(
    instrumentMethod(window, 'onerror', ({ parameters: [message, source, lineno, colno, error] }) =>
      onError({
        message,
        source,
        lineno,
        colno,
        error,
      })
    ),
    instrumentMethod(window, 'onunhandledrejection', ({ parameters: [error] }) => onError({ error: error.reason }))
  )

  return () => subscriptions.forEach((subscription) => subscription.stop())
}
