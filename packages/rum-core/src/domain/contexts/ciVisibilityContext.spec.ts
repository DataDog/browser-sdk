import type { Configuration, RelativeTime } from '@datadog/browser-core'
import { display, HookNames, Observable } from '@datadog/browser-core'
import { mockCiVisibilityValues } from '../../../test'
import type { CookieObservable } from '../../browser/cookieObservable'
import { SessionType } from '../rumSessionManager'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import { ciVisibilityDecoratorFactory, startCiVisibilityContext } from './ciVisibilityContext'

describe('ciVisibilityDecoratorFactory', () => {
  it('should contribute ciTest when testExecutionId is set', async () => {
    const factory = ciVisibilityDecoratorFactory({ getTestExecutionId: () => 'exec-123' })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).ciTest.testExecutionId).toBe('exec-123')
    }
  })

  it('should skip when testExecutionId is undefined', async () => {
    const factory = ciVisibilityDecoratorFactory({ getTestExecutionId: () => undefined })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: false', () => {
    expect(ciVisibilityDecoratorFactory({ getTestExecutionId: () => undefined }).capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "ciVisibility"', () => {
    expect(ciVisibilityDecoratorFactory({ getTestExecutionId: () => undefined }).name).toBe('ciVisibility')
  })
})

describe('startCiVisibilityContext', () => {
  let cookieObservable: CookieObservable
  let stopCiVisibility: () => void
  let hooks: Hooks

  beforeEach(() => {
    cookieObservable = new Observable()
    hooks = createHooks()
  })

  afterEach(() => {
    stopCiVisibility?.()
  })

  describe('assemble hook', () => {
    it('should set ci visibility context defined by Cypress global variables', () => {
      mockCiVisibilityValues('trace_id_value')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.CI_TEST,
        },
        ci_test: {
          test_execution_id: 'trace_id_value',
        },
      })
    })

    it('should add the ci visibility context defined by global cookie', () => {
      mockCiVisibilityValues('trace_id_value', 'cookies')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.CI_TEST,
        },
        ci_test: {
          test_execution_id: 'trace_id_value',
        },
      })
    })

    it('should update the ci visibility context when global cookie is updated', () => {
      mockCiVisibilityValues('trace_id_value', 'cookies')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))
      cookieObservable.notify('trace_id_value_updated')

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.CI_TEST,
        },
        ci_test: {
          test_execution_id: 'trace_id_value_updated',
        },
      })
    })

    it('should not set ci visibility context if the Cypress global variable is undefined', () => {
      mockCiVisibilityValues(undefined)
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should not set ci visibility context if it is not a string', () => {
      mockCiVisibilityValues({ key: 'value' })
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should not throw and emit a warning when Cypress.env throws', () => {
      const displaySpy = spyOn(display, 'warn')
      mockCiVisibilityValues(undefined, 'globals-throws')

      expect(() => {
        ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))
      }).not.toThrow()

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledTimes(1)
      expect(displaySpy.calls.mostRecent().args[0]).toContain('5.88.0')
    })

    it('should not emit a warning when Cypress.env returns a value', () => {
      const displaySpy = spyOn(display, 'warn')
      mockCiVisibilityValues('trace_id_value')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should not emit a warning when the cookie is set', () => {
      const displaySpy = spyOn(display, 'warn')
      mockCiVisibilityValues('trace_id_value', 'cookies')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should not emit a warning when Cypress is not present', () => {
      const displaySpy = spyOn(display, 'warn')
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      expect(displaySpy).not.toHaveBeenCalled()
    })
  })
})
