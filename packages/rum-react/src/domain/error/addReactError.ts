import type { ErrorInfo } from 'react'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../reactPlugin'

/**
 * Report an error originating from React (Error Boundary or `componentDidCatch`)
 * to Datadog RUM. This helper should not be called directly; prefer to use the
 * {@link ErrorBoundary} component or React's error lifecycle.
 *
 * @param error The JavaScript `Error` instance thrown by React.
 * @param info  Additional React error information, including the component stack.
 */
export function addReactError(error: Error, info: ErrorInfo) {
  const handlingStack = createHandlingStack('react error')
  const startClocks = clocksNow()
  onRumStart((strategy) => {
    callMonitored(() => {
      strategy.addError({
        error,
        handlingStack,
        componentStack: info.componentStack ?? undefined,
        context: { framework: 'react' },
        startClocks,
      })
    })
  })
}
