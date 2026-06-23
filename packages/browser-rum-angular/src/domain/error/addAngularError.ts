import type { Context } from '@openobserve/browser-core'
import { clocksNow } from '@openobserve/js-core/time'
import { callMonitored, createHandlingStack } from '@openobserve/browser-core'
import { onRumStart } from '../angularPlugin'

/**
 * Add an Angular error to the RUM session.
 *
 * This function is used internally by `provideDatadogErrorHandler()`, but can also be called
 * directly to report errors caught by custom error handling logic.
 *
 * @category Error
 * @example
 * ```ts
 * import { addAngularError } from '@openobserve/browser-rum-angular'
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
  onRumStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        startClocks,
        context: {
          ...(typeof error === 'object' && error !== null ? (error as { dd_context?: Context }).dd_context : undefined),
          framework: 'angular',
        },
      })
    })
  })
}
