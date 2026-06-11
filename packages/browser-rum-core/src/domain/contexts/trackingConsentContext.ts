import { DISCARDED, SKIPPED } from '@datadog/browser-core'
import type { TrackingConsentState } from '@datadog/browser-core'
import type { AssembleTelemetryHook } from '../hooks'

export function startTrackingConsentContext(
  assembleTelemetryHook: AssembleTelemetryHook,
  trackingConsentState: TrackingConsentState
) {
  assembleTelemetryHook.register(() => {
    const wasConsented = trackingConsentState.isGranted()

    if (!wasConsented) {
      return DISCARDED
    }

    return SKIPPED
  })
}
