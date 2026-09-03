import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { clocksNow } from '@datadog/js-core/time'
import { ErrorSource, NonErrorPrefix, callMonitored, createHandlingStack } from '@datadog/browser-core'
import { formatErrorEvent } from '@datadog/browser-rum-core'
import { onRumInit } from '../vuePlugin'

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
  onRumInit((_configuration, _publicApi, internalApi) => {
    callMonitored(() => {
      const { baseRumEvent, rawError } = formatErrorEvent({
        originalError: error,
        handlingStack,
        componentStack: buildComponentStack(instance, info),
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.CUSTOM,
        startClocks,
      })
      internalApi.addEvent({
        baseRumEvent: {
          ...baseRumEvent,
          context: {
            ...(typeof error === 'object' && error !== null
              ? (error as { dd_context?: object }).dd_context
              : undefined),
            framework: 'vue',
          },
        },
        baggage: {
          startClocks: rawError.startClocks,
          domainContext: { error, handlingStack },
          originalError: error,
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
