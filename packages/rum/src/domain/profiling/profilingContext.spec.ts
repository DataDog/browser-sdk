import { RumEventType, createHooks } from '@datadog/browser-rum-core'
import type { RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import type { AssembleHookParams } from '@datadog/browser-rum-core/src/domain/hooks'
import type { Observation } from '@datadog/browser-rum-core/src/domain/pipeline/rumPipelineEvents'
import { profilingDecoratorFactory, startProfilingContext } from './profilingContext'

const relativeTime: RelativeTime = 1000 as RelativeTime

describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const hooks = createHooks()
    const profilingContextManager = startProfilingContext(hooks)

    profilingContextManager.set({ status: 'running' })

    for (const eventType of [RumEventType.VIEW, RumEventType.LONG_TASK, RumEventType.ACTION, RumEventType.VITAL]) {
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

    for (const eventType of [RumEventType.ERROR, RumEventType.RESOURCE]) {
      const eventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType,
        startTime: relativeTime,
      } as AssembleHookParams)

      expect(eventAttributes).toBeUndefined()
    }
  })
})

describe('profilingDecoratorFactory', () => {
  it('should contribute profiling context for view events', async () => {
    const factory = profilingDecoratorFactory({ getProfiling: () => ({ status: 'running' }) })
    const obs: Observation = { type: RumEventType.VIEW, startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).dd.profiling).toEqual({ status: 'running' })
    }
  })

  it('should skip for error events', async () => {
    const factory = profilingDecoratorFactory({ getProfiling: () => ({ status: 'running' }) })
    const obs: Observation = { type: RumEventType.ERROR, startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should contribute for long_task, action, and vital events', async () => {
    const factory = profilingDecoratorFactory({ getProfiling: () => ({ status: 'starting' }) })
    for (const type of [RumEventType.LONG_TASK, RumEventType.ACTION, RumEventType.VITAL]) {
      const obs: Observation = { type, startTime: 0, data: {} }
      const result = await factory.create({}).decorate(obs, {})
      expect(result.status).toBe('contributed')
    }
  })

  it('should declare canDiscard: false', () => {
    expect(profilingDecoratorFactory({ getProfiling: () => ({ status: 'starting' }) }).capabilities.canDiscard).toBe(
      false
    )
  })
})
