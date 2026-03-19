import type { ComponentPublicInstance } from 'vue'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
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
  onVueStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        componentStack: info || undefined,
        startClocks,
        context: {
          ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
          framework: 'vue',
        },
      })
    })
  })
}
