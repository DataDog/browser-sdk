import { HookNames, SKIPPED } from '@datadog/browser-core'
import type { Hooks, ProfilingInternalContextSchema } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'

export interface ProfilingContextManager {
  set: (next: ProfilingInternalContextSchema) => void
  get: () => ProfilingInternalContextSchema | undefined
}

export function startProfilingContext(hooks: Hooks): ProfilingContextManager {
  let currentContext: ProfilingInternalContextSchema = {
    status: 'starting',
  }

  hooks.register(HookNames.Assemble, ({ eventType }) => {
    if (eventType !== RumEventType.VIEW && eventType !== RumEventType.LONG_TASK) {
      return SKIPPED
    }

    return {
      type: eventType,
      _dd: {
        profiling: currentContext,
      },
    }
  })

  return {
    get: () => currentContext,
    set: (newContext: ProfilingInternalContextSchema) => {
      currentContext = newContext
    },
  }
}
