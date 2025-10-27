import type { ErrorInfo } from 'react'
import {
  callMonitored,
  clocksNow,
  computeRawError,
  createHandlingStack,
  ErrorHandling,
  ErrorSource,
  generateUUID,
  NonErrorPrefix,
} from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { onRumStart } from '../reactPlugin'

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
export function addReactError(error: Error, info: ErrorInfo) {
  const handlingStack = createHandlingStack('react error')
  const startClocks = clocksNow()
  onRumStart((addEvent) => {
    callMonitored(() => {
      const rawError = computeRawError({
        originalError: error,
        handlingStack,
        componentStack: info.componentStack ?? undefined,
        startClocks,
        source: ErrorSource.CUSTOM,
        handling: ErrorHandling.HANDLED,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
      })

      addEvent(
        startClocks.relative,
        {
          type: RumEventType.ERROR,
          date: rawError.startClocks.timeStamp,
          error: {
            id: generateUUID(),
            message: rawError.message,
            source: rawError.source,
            stack: rawError.stack,
            handling_stack: rawError.handlingStack,
            component_stack: rawError.componentStack,
            type: rawError.type,
            handling: rawError.handling,
            causes: rawError.causes,
            source_type: 'browser',
            csp: rawError.csp,
          },
          context: { framework: 'react', ...rawError.context },
        },
        {
          error: rawError.originalError,
          handlingStack: rawError.handlingStack,
        }
      )
    })
  })
}
