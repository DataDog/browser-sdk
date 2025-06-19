import { HookNames } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, ProfilingInternalContextSchema } from '@datadog/browser-rum-core'
import type { AbstractHooks } from '@datadog/browser-core'
export interface ProfilingContextManager {
  set: (next: ProfilingInternalContextSchema) => void
  get: () => ProfilingInternalContextSchema | undefined
}

export const startProfilingContext = (hooks: AbstractHooks): ProfilingContextManager => {
  // Default status is `starting`.
  let currentContext: ProfilingInternalContextSchema = {
    status: 'starting',
  }

  // Register the assemble hook to add the profiling context to the event attributes.
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      _dd: {
        profiling: currentContext,
      },
    })
  )

  return {
    get: () => currentContext,
    set: (newContext: ProfilingInternalContextSchema) => {
      currentContext = newContext
    },
  }
}
