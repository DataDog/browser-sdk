import type { RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import { mockSyntheticsWorkerValues } from '../../../../core/test'
import { SessionType } from '../rumSessionManager'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startSyntheticsContext } from './syntheticsContext'

describe('getSyntheticsContext', () => {
  let hooks: Hooks
  beforeEach(() => {
    hooks = createHooks()
  })

  describe('assemble hook', () => {
    it('should set the synthetics context defined by global variables', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' } }, 'globals')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.SYNTHETICS,
        },
        synthetics: {
          test_id: 'foo',
          result_id: 'bar',
          injected: false,
        },
      })
    })

    it('should set the synthetics context defined by cookie', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' } }, 'cookies')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.SYNTHETICS,
        },
        synthetics: {
          test_id: 'foo',
          result_id: 'bar',
          injected: false,
        },
      })
    })

    it('should pass all extra fields from the context to the synthetics property', () => {
      mockSyntheticsWorkerValues(
        {
          context: {
            test_id: 'foo',
            result_id: 'bar',
            run_type: 'scheduled',
            suite_ids: ['abc'] as any,
          },
        },
        'globals'
      )
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.SYNTHETICS,
        },
        synthetics: {
          test_id: 'foo',
          result_id: 'bar',
          run_type: 'scheduled',
          suite_ids: ['abc'],
          injected: false,
        },
      })
    })

    it('should set the `injected` field to true if the Synthetics test is configured to automatically inject RUM', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' }, injectsRum: true }, 'globals')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.SYNTHETICS,
        },
        synthetics: {
          test_id: 'foo',
          result_id: 'bar',
          injected: true,
        },
      })
    })

    it('should not set synthetics context if the global variable is missing required fields', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo' } as any }, 'globals')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should not set synthetics context if the global variable fields are not strings', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 1, result_id: 2 } as any }, 'globals')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should set the synthetics context from legacy globals when the new context is absent', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'globals')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        session: {
          type: SessionType.SYNTHETICS,
        },
        synthetics: {
          test_id: 'foo',
          result_id: 'bar',
          injected: false,
        },
      })
    })

    it('should not set synthetics context if the cookie is missing required fields', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo' } as any }, 'cookies')
      startSyntheticsContext(hooks)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBeUndefined()
    })
  })
})
