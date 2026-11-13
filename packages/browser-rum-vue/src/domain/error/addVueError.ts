import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { clocksNow } from '@datadog/js-core/time'
import { callMonitored } from '@datadog/js-core/monitor'
import { createHandlingStack } from '@datadog/browser-core'
import { addVueErrorWhenReady } from '../vuePlugin'

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
  callMonitored(() => {
    // Build the whole payload now so the buffered error does not retain the component instance
    addVueErrorWhenReady({
      error,
      handlingStack: createHandlingStack('vue error'),
      componentStack: buildComponentStack(instance, info),
      startClocks: clocksNow(),
      context: {
        ...(typeof error === 'object' && error !== null ? (error as { dd_context?: object }).dd_context : undefined),
        framework: 'vue',
      },
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
