import type { ComponentPublicInstance } from 'vue'
import { onRumStart } from '../nuxtPlugin'
import { reportNuxtError } from './setupNuxtErrorHandling'

/**
 * Add a Nuxt error to the RUM session.
 *
 * @category Error
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { onErrorCaptured } from 'vue'
 * import { addNuxtError } from '@datadog/browser-rum-nuxt'
 *
 * onErrorCaptured((error, instance, info) => {
 *   addNuxtError(error, instance, info)
 * })
 * </script>
 * ```
 */
export function addNuxtError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  onRumStart((addError) => {
    reportNuxtError(addError, error, instance, info)
  })
}
