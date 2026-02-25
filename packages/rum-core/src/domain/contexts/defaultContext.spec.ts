import { mockClock, mockEventBridge } from '@datadog/browser-core/test'
import { HookNames, timeStampNow } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { AssembleHookParams, DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import { startDefaultContext, defaultContextDecoratorFactory } from './defaultContext'

describe('defaultContextDecoratorFactory', () => {
  beforeEach(() => {
    mockClock()
  })

  it('should contribute applicationId and date', async () => {
    const factory = defaultContextDecoratorFactory({
      configuration: mockRumConfiguration({ applicationId: 'app-123' }),
      getCurrentDrift: () => 0,
      getTimeStampNow: () => 12345 as any,
      canUseEventBridge: () => false,
      sdkName: 'rum',
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      const attrs = result.attributes as any
      expect(attrs.application.id).toBe('app-123')
      expect(attrs.date).toBe(12345)
    }
  })

  it('should contribute camelCase _dd fields', async () => {
    const factory = defaultContextDecoratorFactory({
      configuration: mockRumConfiguration({ applicationId: 'app-1', sessionSampleRate: 50, sessionReplaySampleRate: 25, traceSampleRate: 10 }),
      getCurrentDrift: () => 5,
      getTimeStampNow: () => 99999 as any,
      canUseEventBridge: () => false,
      sdkName: 'rum',
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      const attrs = result.attributes as any
      expect(attrs._dd.formatVersion).toBe(2)
      expect(attrs._dd.drift).toBe(5)
      expect(attrs._dd.sdkName).toBe('rum')
    }
  })

  it('should include browserSdkVersion when event bridge is active', async () => {
    const factory = defaultContextDecoratorFactory({
      configuration: mockRumConfiguration({ applicationId: 'app-1' }),
      getCurrentDrift: () => 0,
      getTimeStampNow: () => 0 as any,
      canUseEventBridge: () => true,
      sdkName: 'rum',
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      const attrs = result.attributes as any
      expect(attrs._dd.browserSdkVersion).toBeDefined()
    }
  })

  it('should declare canDiscard: false', () => {
    const factory = defaultContextDecoratorFactory({
      configuration: mockRumConfiguration(),
      getCurrentDrift: () => 0,
      getTimeStampNow: () => 0 as any,
      canUseEventBridge: () => false,
      sdkName: 'rum',
    })
    expect(factory.capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "defaultContext"', () => {
    const factory = defaultContextDecoratorFactory({
      configuration: mockRumConfiguration(),
      getCurrentDrift: () => 0,
      getTimeStampNow: () => 0 as any,
      canUseEventBridge: () => false,
      sdkName: 'rum',
    })
    expect(factory.name).toBe('defaultContext')
  })
})

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
      } as AssembleHookParams)

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
      } as AssembleHookParams) as DefaultRumEventAttributes

      mockEventBridge()

      const eventWithEventBridge = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams) as DefaultRumEventAttributes

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
      } as AssembleHookParams) as DefaultRumEventAttributes

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
