import type { Context } from '@datadog/browser-core'
import { callMonitored, clocksNow, createHandlingStack } from '@datadog/browser-core'
import { onRumStart } from '../nuxtPluginBus'

export function queueNuxtError(error: unknown, componentStack: string | undefined, context: Context) {
  const handlingStack = createHandlingStack('nuxt error')
  const startClocks = clocksNow()
  onRumStart((addError) => {
    callMonitored(() => {
      addError({ error, handlingStack, componentStack, startClocks, context })
    })
  })
}
