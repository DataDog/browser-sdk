import type { RelativeTime } from '@datadog/browser-core'
import { DISCARDED, HookNames, createTrackingConsentState, TrackingConsent } from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startTrackingConsentContext, trackingConsentDecoratorFactory } from './trackingConsentContext'
import type { Observation } from '../pipeline/rumPipelineEvents'

describe('tracking consent context', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  describe('for telemetry (AssembleTelemetry hook)', () => {
    it('should discard telemetry if consent is not granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })

    it('should not discard telemetry if consent is granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 100 as RelativeTime,
      })

      expect(defaultLogAttributes).toBeUndefined()
    })
  })
})

describe('trackingConsentDecoratorFactory', () => {
  it('should discard observation when consent is not granted', async () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => false })
    const decorator = factory.create({})
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await decorator.decorate(obs, {})
    expect(result.status).toBe('discarded')
  })

  it('should skip observation when consent is granted', async () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    const decorator = factory.create({})
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await decorator.decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: true', () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    expect(factory.capabilities.canDiscard).toBe(true)
  })

  it('should declare name: "trackingConsent"', () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    expect(factory.name).toBe('trackingConsent')
  })

  it('should declare provides: [] and requires: []', () => {
    const factory = trackingConsentDecoratorFactory({ hasConsent: () => true })
    expect(factory.provides).toEqual([])
    expect(factory.requires).toEqual([])
  })
})
