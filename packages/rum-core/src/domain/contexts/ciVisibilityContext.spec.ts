import type { Configuration, RelativeTime } from '@datadog/browser-core'
import { HookNames, Observable } from '@datadog/browser-core'
import { mockCiVisibilityValues } from '../../../test'
import type { CookieObservable } from '../../browser/cookieObservable'
import { SessionType } from '../rumSessionManager'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startCiVisibilityContext } from './ciVisibilityContext'

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
      })

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
      })

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
      })

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
      })

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should not set ci visibility context if it is not a string', () => {
      mockCiVisibilityValues({ key: 'value' })
      ;({ stop: stopCiVisibility } = startCiVisibilityContext({} as Configuration, hooks, cookieObservable))

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toBeUndefined()
    })
  })
})
