import { RumEventType, createHooks } from '@datadog/browser-rum-core'
import type { RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import type { AssembleHookParams } from '@datadog/browser-rum-core/src/domain/hooks'
import { startProfilingContext } from './profilingContext'

const relativeTime: RelativeTime = 1000 as RelativeTime

describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const hooks = createHooks()
    const profilingContextManager = startProfilingContext(hooks)

    profilingContextManager.set({ status: 'running' })

    for (const eventType of [RumEventType.VIEW, RumEventType.LONG_TASK]) {
      const eventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType,
        startTime: relativeTime,
      } as AssembleHookParams)

      expect(eventAttributes).toEqual(
        jasmine.objectContaining({
          _dd: {
            profiling: { status: 'running' },
          },
        })
      )
    }

    for (const eventType of [RumEventType.ERROR, RumEventType.ACTION, RumEventType.RESOURCE, RumEventType.VITAL]) {
      const eventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType,
        startTime: relativeTime,
      } as AssembleHookParams)

      expect(eventAttributes).toBeUndefined()
    }
  })
})
