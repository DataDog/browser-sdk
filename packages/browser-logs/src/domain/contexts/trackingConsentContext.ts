import { DISCARDED, SKIPPED } from '@openobserve/js-core/assembly'
import type { TrackingConsentState } from '@openobserve/browser-core'
import type { Hooks } from '../hooks'

export function startTrackingConsentContext(hooks: Hooks, trackingConsentState: TrackingConsentState) {
  function isConsented() {
    const wasConsented = trackingConsentState.isGranted()

    if (!wasConsented) {
      return DISCARDED
    }

    return SKIPPED
  }

  hooks.assemble.register(isConsented)
  hooks.assembleTelemetry.register(isConsented)
}
