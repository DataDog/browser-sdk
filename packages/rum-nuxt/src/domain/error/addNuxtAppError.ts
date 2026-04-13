import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../nuxtPlugin'

/**
 * Add a Nuxt app-level error to the RUM session.
 *
 * @category Error
 * @example
 * ```ts
 * import { addNuxtAppError } from '@datadog/browser-rum-nuxt'
 *
 * export default defineNuxtPlugin((nuxtApp) => {
 *   nuxtApp.hook('app:error', (error) => {
 *     addNuxtAppError(error)
 *   })
 * })
 * ```
 */
export function addNuxtAppError(error: unknown) {
  const handlingStack = createHandlingStack('nuxt error')
  onRumStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        componentStack: undefined,
        startClocks: clocksNow(),
        context: {
          ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
          framework: 'nuxt',
          nuxt: { source: 'app:error' },
        },
      })
    })
  })
}
