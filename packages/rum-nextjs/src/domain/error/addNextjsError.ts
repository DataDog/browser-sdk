import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { ErrorInfo } from 'react'
import { onRumStart } from '../nextjsPlugin'

export function addNextjsError(error: Error & { digest?: string }, errorInfo?: ErrorInfo) {
  const handlingStack = createHandlingStack('nextjs error')
  const startClocks = clocksNow()
  onRumStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        componentStack: errorInfo?.componentStack ?? undefined,
        startClocks,
        context: {
          ...(error as Error & { dd_context?: Context }).dd_context,
          ...(error.digest && { nextjs: { digest: error.digest } }),
          framework: 'nextjs',
        },
      })
    })
  })
}