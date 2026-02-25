import { HookNames, SKIPPED } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { Hooks, ProfilingInternalContextSchema } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Observation } from '@datadog/browser-rum-core/src/domain/pipeline/rumPipelineEvents'

export interface ProfilingContextManager {
  set: (next: ProfilingInternalContextSchema) => void
  get: () => ProfilingInternalContextSchema | undefined
}

export function profilingDecoratorFactory(deps: {
  getProfiling: () => ProfilingInternalContextSchema
}): DecoratorFactory<Observation, { dd?: { profiling: ProfilingInternalContextSchema } }> {
  return {
    name: 'profiling',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (event, _accumulated) => {
        if (
          event.type !== RumEventType.VIEW &&
          event.type !== RumEventType.LONG_TASK &&
          event.type !== RumEventType.ACTION &&
          event.type !== RumEventType.VITAL
        ) {
          return Promise.resolve({ status: 'skipped' as const })
        }
        return Promise.resolve({
          status: 'contributed' as const,
          attributes: { dd: { profiling: deps.getProfiling() } },
        })
      },
    }),
  }
}

export function startProfilingContext(hooks: Hooks): ProfilingContextManager {
  let currentContext: ProfilingInternalContextSchema = {
    status: 'starting',
  }

  hooks.register(HookNames.Assemble, ({ eventType }) => {
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
    }
  })

  return {
    get: () => currentContext,
    set: (newContext: ProfilingInternalContextSchema) => {
      currentContext = newContext
    },
  }
}
