import type { RelativeTime } from '@datadog/browser-core'
import { DISCARDED, HookNames, createTrackingConsentState, TrackingConsent } from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startTrackingConsentContext } from './trackingConsentContext'

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
