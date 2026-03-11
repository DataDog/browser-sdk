import {
  callMonitored,
  clocksNow,
  combine,
  computeRawError,
  createHandlingStack,
  ErrorHandling,
  ErrorSource,
  generateUUID,
  NonErrorPrefix,
  sanitize,
} from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { onRumStart } from '../nextjsPlugin'

export function addNextjsError(error: Error & { digest?: string }, context?: Record<string, unknown>) {
  const handlingStack = createHandlingStack('nextjs error')
  const startClocks = clocksNow()
  onRumStart((addEvent) => {
    callMonitored(() => {
      const sanitizedContext = sanitize(context) as Context | undefined
      const nextjsContext =
        sanitizedContext?.nextjs instanceof Object ? (sanitizedContext.nextjs as Record<string, unknown>) : {}
      const nextjsExtra = error.digest !== undefined ? { nextjs: { ...nextjsContext, digest: error.digest } } : {}
      const rawError = computeRawError({
        originalError: error,
        handlingStack,
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
            type: rawError.type,
            handling: rawError.handling,
            causes: rawError.causes,
            source_type: 'browser',
            csp: rawError.csp,
          },
          context: { ...combine(rawError.context, sanitizedContext), framework: 'nextjs', ...nextjsExtra },
        },
        {
          error: rawError.originalError,
          handlingStack: rawError.handlingStack,
        }
      )
    })
  })
}
