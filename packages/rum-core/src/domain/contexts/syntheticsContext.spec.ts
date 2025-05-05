import type { RelativeTime } from '@datadog/browser-core'
import { mockSyntheticsWorkerValues } from '../../../../core/test'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { createHooks, HookNames } from '../../hooks'
import { SessionType } from '../rumSessionManager'
import { startSyntheticsContext } from './syntheticsContext'

describe('getSyntheticsContext', () => {
  let hooks: Hooks
  beforeEach(() => {
    hooks = createHooks()
  })

  describe('assemble hook', () => {
    it('should set the synthetics context defined by global variables', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'globals')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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

    it('should set the synthetics context defined by global cookie', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'cookies')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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

    it('should set the `injected` field to true if the Synthetics test is configured to automatically inject RUM', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar', injectsRum: true }, 'globals')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({
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

    it('should not set synthetics context if one global variable is undefined', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo' }, 'globals')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })

    it('should not set synthetics context if global variables are not strings', () => {
      mockSyntheticsWorkerValues({ publicId: 1, resultId: 2 }, 'globals')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })

    it('should not set synthetics context if one cookie is undefined', () => {
      mockSyntheticsWorkerValues({ publicId: 'foo' }, 'cookies')
      startSyntheticsContext(hooks)

      const event = hooks.triggerHook(HookNames.Assemble, { eventType: 'view', startTime: 0 as RelativeTime })

      expect(event).toEqual({} as PartialRumEvent)
    })
  })
})
