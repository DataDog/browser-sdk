import type { Context } from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import { ErrorSource, NonErrorPrefix, callMonitored, createHandlingStack } from '@datadog/browser-core'
import { formatErrorEvent } from '@datadog/browser-rum-core'
import { onRumInit } from '../angularPlugin'

/**
 * Add an Angular error to the RUM session.
 *
 * This function is used internally by `provideDatadogErrorHandler()`, but can also be called
 * directly to report errors caught by custom error handling logic.
 *
 * @category Error
 * @example
 * ```ts
 * import { addAngularError } from '@datadog/browser-rum-angular'
 *
 * // In a custom ErrorHandler
 * handleError(error: any) {
 *   addAngularError(error)
 *   // your own error handling...
 * }
 * ```
 */
export function addAngularError(error: unknown) {
  const handlingStack = createHandlingStack('angular error')
  const startClocks = clocksNow()
  onRumInit((_configuration, _publicApi, internalApi) => {
    callMonitored(() => {
      const { baseRumEvent, rawError } = formatErrorEvent({
        originalError: error,
        handlingStack,
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
            framework: 'angular',
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
