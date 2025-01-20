import type { ErrorInfo } from 'react'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../reactPlugin'

export function addReactError(error: Error, info: ErrorInfo) {
  const handlingStack = createHandlingStack()
  onRumStart((strategy) => {
    callMonitored(() => {
      strategy.addError({
        error,
        handlingStack,
        componentStack: info.componentStack ?? undefined,
        context: { framework: 'react' },
        startClocks: clocksNow(),
      })
    })
  })
}
