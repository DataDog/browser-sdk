import { DISCARDED, SKIPPED } from '@openobserve/js-core/assembly'
import type { TrackingConsentState } from '@openobserve/browser-core'
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
