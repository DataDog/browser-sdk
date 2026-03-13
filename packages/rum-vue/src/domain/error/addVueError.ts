import type { ComponentPublicInstance } from 'vue'
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
import { onVueStart } from '../vuePlugin'

/**
 * Add a Vue error to the RUM session.
 *
 * @category Error
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { addVueError } from '@datadog/browser-rum-vue'
 *
 * const app = createApp(App)
 * // Report all Vue errors to Datadog automatically
 * app.config.errorHandler = addVueError
 * ```
 */
export function addVueError(
  error: unknown,
  // Required by Vue's app.config.errorHandler signature, but not used by the SDK
  _instance: ComponentPublicInstance | null,
  info: string
) {
  const handlingStack = createHandlingStack('vue error')
  const startClocks = clocksNow()
  onVueStart((addEvent) => {
    callMonitored(() => {
      const rawError = computeRawError({
        originalError: error,
        handlingStack,
        componentStack: info || undefined,
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
            component_stack: rawError.componentStack,
            type: rawError.type,
            handling: rawError.handling,
            causes: rawError.causes,
            source_type: 'browser',
            csp: rawError.csp,
          },
          context: { framework: 'vue', ...rawError.context },
        },
        {
          error: rawError.originalError,
          handlingStack: rawError.handlingStack,
        }
      )
    })
  })
}
