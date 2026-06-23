import { SKIPPED } from '@openobserve/js-core/assembly'
import type { Hooks, ProfilingInternalContextSchema } from '@openobserve/browser-rum-core'
import { RumEventType } from '@openobserve/browser-rum-core'

export interface ProfilingContextManager {
  set: (next: ProfilingInternalContextSchema) => void
  get: () => ProfilingInternalContextSchema | undefined
}

export function startProfilingContext(hooks: Hooks): ProfilingContextManager {
  let currentContext: ProfilingInternalContextSchema = {
    status: 'starting',
  }

  hooks.assemble.register(({ eventType }) => {
    if (
      eventType !== RumEventType.VIEW &&
      eventType !== RumEventType.LONG_TASK &&
      eventType !== RumEventType.ACTION &&
      eventType !== RumEventType.VITAL
    ) {
      return SKIPPED
    }

    return {
      type: eventType,
      _oo: {
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
