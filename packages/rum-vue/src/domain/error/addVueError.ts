import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
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
export function addVueError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  const handlingStack = createHandlingStack('vue error')
  const startClocks = clocksNow()
  onVueStart((addError) => {
    callMonitored(() => {
      addError({
        error,
        handlingStack,
        componentStack: buildComponentStack(instance, info),
        startClocks,
        context: {
          ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
          framework: 'vue',
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
