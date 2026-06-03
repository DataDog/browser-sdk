import { DISCARDED, HookNames, SKIPPED } from '@datadog/browser-core'
import type { TrackingConsentState } from '@datadog/browser-core'
import type { Hooks } from '../hooks'

export function startTrackingConsentContext(hooks: Hooks, trackingConsentState: TrackingConsentState) {
  function isConsented() {
    const wasConsented = trackingConsentState.isGranted()

    if (!wasConsented) {
      return DISCARDED
    }

    return SKIPPED
  }

  hooks.register(HookNames.Assemble, isConsented)
  hooks.register(HookNames.AssembleTelemetry, isConsented)
}
