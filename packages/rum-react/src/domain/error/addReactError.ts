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
          type: RumEventType.ERROR as const,
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
          context: { framework: 'react' },
        },
        {
          error: rawError.originalError,
          handlingStack: rawError.handlingStack,
        }
      )
    })
  })
}
