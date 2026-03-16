import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { ErrorInfo } from 'react'
import { onRumStart } from '../nextjsPlugin'

/**
 * Add a Next.js error to the RUM session.
 *
 * @category Error
 * @example
 * ```ts
 * // app/error.tsx (or app/global-error.tsx)
 * 'use client'
 * import { useEffect } from 'react'
 * import { addNextjsError } from '@datadog/browser-rum-nextjs'
 *
 * export default function Error({ error }: { error: Error & { digest?: string } }) {
 *   useEffect(() => {
 *     addNextjsError(error)
 *   }, [error])
 *   return <div>Something went wrong</div>
 * }
 * ```
 */
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
