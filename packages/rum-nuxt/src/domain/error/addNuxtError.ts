import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../nuxtPlugin'

/**
 * Add a Nuxt error to the RUM session.
 *
 * @category Error
 * @example
 * ```ts
 * // plugins/datadog-rum.client.ts
 * export default defineNuxtPlugin((nuxtApp) => {
 *   nuxtApp.hook('vue:error', (error, instance, info) => {
 *     addNuxtError(error, instance, info as string)
 *   })
 * })
 * ```
 */
export function addNuxtError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  const handlingStack = createHandlingStack('nuxt error')
  const startClocks = clocksNow()
  onRumStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        componentStack: buildComponentStack(instance, info),
        startClocks,
        context: {
          ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
          framework: 'nuxt',
        },
      })
    })
  })
}

function buildComponentStack(instance: ComponentPublicInstance | null, info: string): string | undefined {
  const parts: string[] = []

  if (info) {
    parts.push(info)
  }

  let current: ComponentInternalInstance | null = instance?.$ ?? null
  while (current) {
    const name =
      current.type &&
      ('name' in current.type
        ? current.type.name
        : '__name' in current.type
          ? (current.type as { __name?: string }).__name
          : undefined)
    if (name) {
      parts.push(`at <${name}>`)
    }
    current = current.parent
  }

  return parts.length > 0 ? parts.join('\n') : undefined
}
