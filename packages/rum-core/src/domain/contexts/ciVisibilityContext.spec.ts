import type { RelativeTime } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import { mockCiVisibilityValues } from '../../../test'
import type { CookieObservable } from '../../browser/cookieObservable'
import { createHooks, HookNames } from '../../hooks'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { SessionType } from '../rumSessionManager'
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
      ;({ stop: stopCiVisibility } = startCiVisibilityContext(hooks, cookieObservable))

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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
      ;({ stop: stopCiVisibility } = startCiVisibilityContext(hooks, cookieObservable))

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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
      ;({ stop: stopCiVisibility } = startCiVisibilityContext(hooks, cookieObservable))
      cookieObservable.notify('trace_id_value_updated')

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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
      ;({ stop: stopCiVisibility } = startCiVisibilityContext(hooks, cookieObservable))

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })

    it('should not set ci visibility context if it is not a string', () => {
      mockCiVisibilityValues({ key: 'value' })
      ;({ stop: stopCiVisibility } = startCiVisibilityContext(hooks, cookieObservable))

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })
  })
})
