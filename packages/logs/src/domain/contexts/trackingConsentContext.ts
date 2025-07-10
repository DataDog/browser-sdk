import { DISCARDED, HookNames } from '@datadog/browser-core'
import type { TrackingConsentState } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { Hooks } from '../hooks'

export function startTrackingConsentContext(
  hooks: Hooks,
  configuration: LogsConfiguration,
  trackingConsentState: TrackingConsentState
) {
  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const wasConsented = trackingConsentState.isGranted(startTime)

    if (!wasConsented) {
      return DISCARDED
    }

    return {}
  })
}