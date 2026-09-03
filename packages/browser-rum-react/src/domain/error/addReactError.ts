import type { ErrorInfo } from 'react'
import type { Context } from '@datadog/browser-core'
import { ErrorSource, NonErrorPrefix, callMonitored, createHandlingStack } from '@datadog/browser-core'
import { formatErrorEvent } from '@datadog/browser-rum-core'
import { clocksNow } from '@datadog/js-core/time'
import { onRumInit } from '../reactPlugin'

/**
 * Add a React error to the RUM session.
 *
 * @category Error
 * @example
 * ```ts
 * import { createRoot } from 'react-dom/client'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { addReactError } from '@datadog/browser-rum-react'
 *
 * const container = document.getElementById('root')
 * const root = createRoot(container, {
 *   onUncaughtError: (error, errorInfo) => {
 *     // Report uncaught errors to Datadog
 *     addReactError(error, errorInfo)
 *   }
 * })
 * // ...
 * ```
 */
export function addReactError(error: unknown, info: ErrorInfo) {
  const handlingStack = createHandlingStack('react error')
  const startClocks = clocksNow()
  onRumInit((_configuration, _publicApi, internalApi) => {
    callMonitored(() => {
      const { baseRumEvent, rawError } = formatErrorEvent({
        originalError: error,
        handlingStack,
        componentStack: info.componentStack ?? undefined,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.CUSTOM,
        startClocks,
      })
      internalApi.addEvent({
        baseRumEvent: {
          ...baseRumEvent,
          context: {
            ...(typeof error === 'object' && error !== null
              ? (error as { dd_context?: Context }).dd_context
              : undefined),
            framework: 'react',
          },
        },
        baggage: {
          startClocks: rawError.startClocks,
          domainContext: { error, handlingStack },
          originalError: error,
        },
      })
    })
  })
}
