import { setNavigatorOnLine, setNavigatorConnection } from '@datadog/browser-core/test'
import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import { connectivityDecoratorFactory, startConnectivityContext } from './connectivityContext'

describe('connectivityDecoratorFactory', () => {
  it('should contribute connectivity attributes', async () => {
    const factory = connectivityDecoratorFactory()
    const decorator = factory.create({})
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await decorator.decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).connectivity).toBeDefined()
    }
  })

  it('should declare canDiscard: false', () => {
    expect(connectivityDecoratorFactory().capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "connectivity"', () => {
    expect(connectivityDecoratorFactory().name).toBe('connectivity')
  })
})

describe('startConnectivityContext', () => {
  describe('assemble hook', () => {
    let hooks: Hooks

    beforeEach(() => {
      hooks = createHooks()
    })

    it('should set ci visibility context defined by Cypress global variables', () => {
      startConnectivityContext(hooks)
      setNavigatorOnLine(true)
      setNavigatorConnection({ effectiveType: '2g' })
      const event = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(event).toEqual({
        type: 'view',
        connectivity: {
          status: 'connected',
          effective_type: '2g',
          interfaces: undefined,
        },
      })
    })
  })
})
