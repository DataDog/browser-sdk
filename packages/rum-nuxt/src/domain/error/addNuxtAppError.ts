import { queueNuxtError } from './queueNuxtError'

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
  queueNuxtError(error, undefined, {
    ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
    framework: 'nuxt',
    nuxt: { source: 'app:error' },
  })
}
