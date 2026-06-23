import { RumEventType, createHooks } from '@openobserve/browser-rum-core'
import type { RelativeTime } from '@openobserve/js-core/time'
import type { AssembleHookParams } from '@openobserve/browser-rum-core/src/domain/hooks'
import { startProfilingContext } from './profilingContext'

const relativeTime: RelativeTime = 1000 as RelativeTime

describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const hooks = createHooks()
    const profilingContextManager = startProfilingContext(hooks)

    profilingContextManager.set({ status: 'running' })

    for (const eventType of [RumEventType.VIEW, RumEventType.LONG_TASK, RumEventType.ACTION, RumEventType.VITAL]) {
      const eventAttributes = hooks.assemble.trigger({
        eventType,
        startTime: relativeTime,
      } as AssembleHookParams)

      expect(eventAttributes).toEqual(
        jasmine.objectContaining({
          _oo: {
            profiling: { status: 'running' },
          },
        })
      )
    }

    for (const eventType of [RumEventType.ERROR, RumEventType.RESOURCE]) {
      const eventAttributes = hooks.assemble.trigger({
        eventType,
        startTime: relativeTime,
      } as AssembleHookParams)

      expect(eventAttributes).toBeUndefined()
    }
  })
})
