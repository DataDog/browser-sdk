import { beforeEach, describe, expect, it } from 'vitest'
import type { RelativeTime } from '@datadog/js-core/time'
import { createTrackingConsentState, TrackingConsent } from '@datadog/browser-core'
import { DISCARDED, createHook } from '@datadog/js-core/assembly'
import type { AssembleTelemetryHook } from '../hooks'
import { startTrackingConsentContext } from './trackingConsentContext'

describe('tracking consent context', () => {
  let hook: AssembleTelemetryHook

  beforeEach(() => {
    hook = createHook()
  })

  describe('for telemetry (AssembleTelemetry hook)', () => {
    it('should discard telemetry if consent is not granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
      startTrackingConsentContext(hook, trackingConsentState)

      const defaultLogAttributes = hook.trigger({
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })

    it('should not discard telemetry if consent is granted', () => {
      const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
      startTrackingConsentContext(hook, trackingConsentState)

      const defaultLogAttributes = hook.trigger({
        startTime: 100 as RelativeTime,
      })

      expect(defaultLogAttributes).toBeUndefined()
    })
  })
})
