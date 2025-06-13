import type { ErrorInfo } from 'react'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../reactPlugin'

/**
 * Reports an error originating from React (Error Boundary or `componentDidCatch`)
 * to Datadog RUM with relevant context and stack information.
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
