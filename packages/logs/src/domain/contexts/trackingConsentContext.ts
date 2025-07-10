import { DISCARDED, HookNames } from '@datadog/browser-core'
import type { TrackingConsentState } from '@datadog/browser-core'
import type { Hooks } from '../hooks'

export function startTrackingConsentContext(hooks: Hooks, trackingConsentState: TrackingConsentState) {
  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const wasConsented = trackingConsentState.isGranted(startTime)

    if (!wasConsented) {
      return DISCARDED
    }

    return {}
  })
}
