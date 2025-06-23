// Let's write some test for the profiling context.
// In particular, we want to test that the profiling context is added to the event attributes only for the right event types.

import { RumEventType } from '@datadog/browser-rum-core'
import { HookNames } from '@datadog/browser-core'
import { createHooks } from '@datadog/browser-core/test'
import { startProfilingContext } from './profilingContext'

describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const hooks = createHooks()
    const profilingContextManager = startProfilingContext(hooks)

    profilingContextManager.set({ status: 'running' })

    const viewRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.VIEW })

    expect(viewRumEventAttributes).toEqual(
      jasmine.objectContaining({
        _dd: {
          profiling: { status: 'running' },
        },
      })
    )

    const longTaskRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.LONG_TASK })

    expect(longTaskRumEventAttributes).toEqual(
      jasmine.objectContaining({
        _dd: {
          profiling: { status: 'running' },
        },
      })
    )

    const errorRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.ERROR })

    expect(errorRumEventAttributes).toBeUndefined()

    const actionRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.ACTION })

    expect(actionRumEventAttributes).toBeUndefined()

    const resourceRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.RESOURCE })

    expect(resourceRumEventAttributes).toBeUndefined()

    const vitalRumEventAttributes = hooks.triggerHook(HookNames.Assemble, { eventType: RumEventType.VITAL })

    expect(vitalRumEventAttributes).toBeUndefined()
  })
})
