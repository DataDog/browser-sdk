import { clocksNow } from '@datadog/js-core/time'
import { ErrorSource, NonErrorPrefix, callMonitored, createHandlingStack } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import type { ErrorInfo } from 'react'
import { formatErrorEvent } from '@datadog/browser-rum-core'
import { onRumInit } from '../nextjsPlugin'

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
  onRumInit((_rumPublicApi, internalApi) => {
    callMonitored(() => {
      const { baseRumEvent, rawError } = formatErrorEvent({
        originalError: error,
        handlingStack,
        componentStack: errorInfo?.componentStack ?? undefined,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.CUSTOM,
        startClocks,
      })
      internalApi.addEvent({
        baseRumEvent: {
          ...baseRumEvent,
          context: {
            ...(error as Error & { dd_context?: Context }).dd_context,
            ...(error.digest && { nextjs: { digest: error.digest } }),
            framework: 'nextjs',
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
