import { mockClock, mockEventBridge } from '@datadog/browser-core/test'
import { HookNames, timeStampNow } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startDefaultContext } from './defaultContext'

describe('startDefaultContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    mockClock()
    hooks = createHooks()
  })

  describe('assemble hook', () => {
    it('should set the rum default context', () => {
      startDefaultContext(hooks, mockRumConfiguration({ applicationId: '1' }), 'rum')
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
      startDefaultContext(hooks, mockRumConfiguration(), 'rum')
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
      startDefaultContext(
        hooks,
        mockRumConfiguration({ sessionSampleRate: 10, sessionReplaySampleRate: 20, traceSampleRate: 30 }),
        'rum'
      )

      const event = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      }) as DefaultRumEventAttributes

      expect(event._dd!.configuration!.session_sample_rate).toBe(10)
      expect(event._dd!.configuration!.session_replay_sample_rate).toBe(20)
      expect(event._dd!.configuration!.trace_sample_rate).toBe(30)
      expect(event._dd!.configuration!.profiling_sample_rate).toBe(0)
      expect(event._dd!.sdk_name).toBe('rum')
    })
  })

  describe('assemble telemetry hook', () => {
    it('should set the application id', () => {
      startDefaultContext(hooks, mockRumConfiguration(), 'rum')

      const telemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      }) as DefaultTelemetryEventAttributes

      expect(telemetryEventAttributes.application?.id).toEqual('appId')
    })
  })
})
