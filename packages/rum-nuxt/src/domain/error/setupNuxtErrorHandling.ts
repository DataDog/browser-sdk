import type { StartRumResult } from '@datadog/browser-rum-core'
import type { ComponentInternalInstance, ComponentPublicInstance, App } from 'vue'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'

export interface NuxtApp {
  vueApp: App
  hook(name: 'app:error', callback: (err: unknown) => void): void
}

export type NuxtErrorReporter = (error: unknown, instance: ComponentPublicInstance | null, info: string) => void

export function reportNuxtError(
  addError: StartRumResult['addError'],
  error: unknown,
  instance: ComponentPublicInstance | null,
  info: string
) {
  const handlingStack = createHandlingStack('nuxt error')
  const startClocks = clocksNow()

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
}

export function setupNuxtErrorHandling(nuxtApp: NuxtApp, reportError: NuxtErrorReporter): void {
  const deduplicatedReportError = callOnce(reportError)

  // Wrap existing errorHandler rather than replacing it, so Nuxt's own
  // handleVueError (which drives the error page) is still called.
  const original = nuxtApp.vueApp.config.errorHandler
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    deduplicatedReportError(error, instance, info)
    original?.(error, instance, info)
  }

  nuxtApp.hook('app:error', (err) => {
    deduplicatedReportError(err, null, '')
  })
}

function callOnce(func: NuxtErrorReporter) {
  const seen = new WeakSet<object>()
  return (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    if (error !== null && typeof error === 'object') {
      if (seen.has(error)) {
        return
      }
      seen.add(error)
    }
    func(error, instance, info)
  }
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
