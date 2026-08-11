import type { RelativeTime } from '@datadog/js-core/time'
import { createTrackingConsentState, TrackingConsent } from '@datadog/browser-core'
import { DISCARDED } from '@datadog/js-core/assembly'
import type { DefaultLogsEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { startTrackingConsentContext } from './trackingConsentContext'

describe('tracking consent context', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  it('should discard logs if consent is not granted', () => {
    const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
    startTrackingConsentContext(hooks, trackingConsentState)

    const defaultLogAttributes = hooks.assemble.trigger({
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toBe(DISCARDED)
  })

  it('should not discard logs if consent is granted and no startTime is provided', () => {
    const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
    startTrackingConsentContext(hooks, trackingConsentState)

    const defaultLogAttributes = hooks.assemble.trigger({
      startTime: undefined as any,
    }) as DefaultLogsEventAttributes

    expect(defaultLogAttributes).toBeUndefined()
  })

  it('should not discard logs when startTime is provided (due to empty history)', () => {
    const trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
    startTrackingConsentContext(hooks, trackingConsentState)

    const defaultLogAttributes = hooks.assemble.trigger({
      startTime: 100 as RelativeTime,
    })

    expect(defaultLogAttributes).toBeUndefined()
  })

  it('should discard logs when startTime is provided and consent was not granted initially', () => {
    const trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
    startTrackingConsentContext(hooks, trackingConsentState)

    const defaultLogAttributes = hooks.assemble.trigger({
      startTime: 100 as RelativeTime,
    })

    expect(defaultLogAttributes).toBe(DISCARDED)
  })
})
