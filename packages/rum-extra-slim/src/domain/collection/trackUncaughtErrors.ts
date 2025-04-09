import { instrumentMethod, sanitize } from '@datadog/browser-core'
import { EVENT, type UncaughtErrorEvent } from '../event'
import type { TransportManager } from '../transportManager'

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
    error?: Error & Record<string, unknown>
  }): void {
    const data: UncaughtErrorEvent = {
      type: EVENT.UNCAUGHT_ERROR,
      message,
      source,
      lineno,
      colno,
    }

    if (error) {
      data.error = {
        stack: error.stack,
        message: error.message,
        fingerprint: sanitize(error.dd_fingerprint),
        context: sanitize(error.dd_context),
      }
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
        error: error as Error & Record<string, unknown>,
      })
    ),
    instrumentMethod(window, 'onunhandledrejection', ({ parameters: [error] }) => onError({ error: error.reason }))
  )

  return () => subscriptions.forEach((subscription) => subscription.stop())
}
