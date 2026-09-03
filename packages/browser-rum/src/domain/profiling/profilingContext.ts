import { SKIPPED } from '@datadog/js-core/assembly'
import type { Context } from '@datadog/browser-core'
import type { ProfilingInternalContextSchema, RumInternalApi } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'

export interface ProfilingContextManager {
  set: (next: ProfilingInternalContextSchema) => void
  get: () => ProfilingInternalContextSchema | undefined
}

export function startProfilingContext(internalApi: RumInternalApi): ProfilingContextManager {
  let currentContext: ProfilingInternalContextSchema = {
    status: 'starting',
  }

  internalApi.registerHook(({ eventType }) => {
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
      _dd: {
        profiling: currentContext,
      },
    } as Context
  })

  return {
    get: () => currentContext,
    set: (newContext: ProfilingInternalContextSchema) => {
      currentContext = newContext
    },
  }
}
