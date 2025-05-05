import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, mockEventBridge } from '@datadog/browser-core/test'
import { timeStampNow, type RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { Hooks, DefaultRumEventAttributes } from '../../hooks'
import { createHooks, HookNames } from '../../hooks'
import { startDefaultContext } from './defaultContext'

describe('startDefaultContext', () => {
  describe('assemble hook', () => {
    let hooks: Hooks
    let clock: Clock

    beforeEach(() => {
      clock = mockClock()
      hooks = createHooks()
      registerCleanupTask(() => clock.cleanup())
    })

    it('should set the rum default context', () => {
      startDefaultContext(hooks, mockRumConfiguration({ applicationId: '1' }))
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        application: {
          id: '1',
        },
        date: timeStampNow(),
        source: 'browser',
        _dd: jasmine.objectContaining({
          format_version: 2,
          drift: jasmine.any(Number),
        }),
      })
    })

    it('should set the browser sdk version if event bridge detected', () => {
      startDefaultContext(hooks, mockRumConfiguration())
      const eventWithoutEventBridge = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      }) as DefaultRumEventAttributes

      mockEventBridge()

      const eventWithEventBridge = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      }) as DefaultRumEventAttributes

      expect(eventWithEventBridge._dd!.browser_sdk_version).toBeDefined()
      expect(eventWithoutEventBridge._dd!.browser_sdk_version).toBeUndefined()
    })

    it('should set the configured sample rates', () => {
      startDefaultContext(hooks, mockRumConfiguration({ sessionSampleRate: 10, sessionReplaySampleRate: 20 }))

      const event = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      }) as DefaultRumEventAttributes

      expect(event._dd!.configuration!.session_sample_rate).toBe(10)
      expect(event._dd!.configuration!.session_replay_sample_rate).toBe(20)
    })
  })
})
