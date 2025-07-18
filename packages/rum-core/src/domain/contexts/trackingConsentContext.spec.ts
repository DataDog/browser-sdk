import type { RelativeTime } from '@datadog/browser-core'
import { DISCARDED, HookNames, createTrackingConsentState, TrackingConsent } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startTrackingConsentContext } from './trackingConsentContext'

describe('tracking consent context', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  describe('for regular RUM events (Assemble hook)', () => {
    it('should discard RUM events if consent is not granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view' as const,
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })

    it('should not discard RUM events if consent is granted and no startTime is provided', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view' as const,
        startTime: undefined as any,
      }) as DefaultRumEventAttributes

      expect(defaultLogAttributes).toBeUndefined()
    })

    it('should not discard RUM events when startTime is provided (due to empty history)', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view' as const,
        startTime: 100 as RelativeTime,
      })

      expect(defaultLogAttributes).toBeUndefined()
    })

    it('should discard RUM events when startTime is provided and consent was not granted initially', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
      startTrackingConsentContext(hooks, trackingConsentState)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view' as const,
        startTime: 100 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })
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
