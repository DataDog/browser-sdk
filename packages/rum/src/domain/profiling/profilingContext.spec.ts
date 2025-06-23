// Let's write some test for the profiling context.
// In particular, we want to test that the profiling context is added to the event attributes only for the right event types.

import type { Hooks } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { RelativeTime } from '@datadog/browser-core';
import { HookNames } from '@datadog/browser-core'
import { createHooks } from '@datadog/browser-core/test'
import { startProfilingContext } from './profilingContext'

const relativeTime: RelativeTime = 1000 as RelativeTime

describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const hooks = createHooks() as Hooks
    const profilingContextManager = startProfilingContext(hooks)

    profilingContextManager.set({ status: 'running' })

    const viewRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.VIEW, startTime: relativeTime })

    expect(viewRumEventAttributes).toEqual(
      jasmine.objectContaining({
        _dd: {
          profiling: { status: 'running' },
        },
      })
    )

    const longTaskRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.LONG_TASK, startTime: relativeTime })

    expect(longTaskRumEventAttributes).toEqual(
      jasmine.objectContaining({
        _dd: {
          profiling: { status: 'running' },
        },
      })
    )

    const errorRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.ERROR, startTime: relativeTime })

    expect(errorRumEventAttributes).toBeUndefined()

    const actionRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.ACTION, startTime: relativeTime })

    expect(actionRumEventAttributes).toBeUndefined()

    const resourceRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.RESOURCE, startTime: relativeTime })

    expect(resourceRumEventAttributes).toBeUndefined()

    const vitalRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.VITAL, startTime: relativeTime })

    expect(vitalRumEventAttributes).toBeUndefined()
  })
})
