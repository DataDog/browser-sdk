import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../nuxtPlugin'

const reportedErrors = new WeakSet<object>()

/**
 * Add a Nuxt error to the RUM session.
 *
 * Compatible with both Vue's `app.config.errorHandler` and Nuxt's `app:error` hook.
 * Deduplicates errors automatically when both hooks fire for the same error instance.
 *
 * @category Error
 * @example
 * ```ts
 * import { defineNuxtPlugin, useNuxtApp } from 'nuxt/app'
 * import { addNuxtError } from '@datadog/browser-rum-nuxt'
 *
 * export default defineNuxtPlugin((nuxtApp) => {
 *   // Vue rendering/lifecycle errors
 *   nuxtApp.vueApp.config.errorHandler = addNuxtError
 *   // Nuxt startup errors (plugins, app hooks)
 *   nuxtApp.hook('app:error', (err) => addNuxtError(err, null, ''))
 * })
 * ```
 */
export function addNuxtError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  if (error !== null && typeof error === 'object') {
    if (reportedErrors.has(error)) {
      return
    }
    reportedErrors.add(error)
  }

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
