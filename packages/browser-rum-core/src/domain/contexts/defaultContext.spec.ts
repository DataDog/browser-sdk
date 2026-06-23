import { mockClock, mockEventBridge } from '@openobserve/browser-core/test'
import { timeStampNow } from '@openobserve/js-core/time'
import type { RelativeTime } from '@openobserve/js-core/time'
import { createHook } from '@openobserve/js-core/assembly'
import { mockRumConfiguration } from '../../../test'
import type { AssembleHook, AssembleHookParams, DefaultRumEventAttributes } from '../hooks'
import { startDefaultContext } from './defaultContext'

describe('startDefaultContext', () => {
  let hook: AssembleHook

  beforeEach(() => {
    mockClock()
    hook = createHook()
  })

  describe('assemble hook', () => {
    it('should set the rum default context', () => {
      startDefaultContext(hook, mockRumConfiguration({ applicationId: '1' }), 'rum')
      const defaultRumEventAttributes = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        application: {
          id: '1',
        },
        date: timeStampNow(),
        source: 'browser',
        _oo: jasmine.objectContaining({
          format_version: 2,
          drift: jasmine.any(Number),
        }),
      })
    })

    it('should set the browser sdk version if event bridge detected', () => {
      startDefaultContext(hook, mockRumConfiguration(), 'rum')
      const eventWithoutEventBridge = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams) as DefaultRumEventAttributes

      mockEventBridge()

      const eventWithEventBridge = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams) as DefaultRumEventAttributes

      expect(eventWithEventBridge._oo!.browser_sdk_version).toBeDefined()
      expect(eventWithoutEventBridge._oo!.browser_sdk_version).toBeUndefined()
    })

    it('should set the configured sample rates', () => {
      startDefaultContext(
        hook,
        mockRumConfiguration({ sessionSampleRate: 10, sessionReplaySampleRate: 20, traceSampleRate: 30 }),
        'rum'
      )

      const event = hook.trigger({
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams) as DefaultRumEventAttributes

      expect(event._oo!.configuration!.session_sample_rate).toBe(10)
      expect(event._oo!.configuration!.session_replay_sample_rate).toBe(20)
      expect(event._oo!.configuration!.trace_sample_rate).toBe(30)
      expect(event._oo!.configuration!.profiling_sample_rate).toBe(0)
      expect(event._oo!.sdk_name).toBe('rum')
    })
  })
})
