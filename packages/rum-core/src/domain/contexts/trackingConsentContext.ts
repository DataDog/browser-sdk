import { DISCARDED, HookNames, SKIPPED } from '@datadog/browser-core'
import type { TrackingConsentState } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export function startTrackingConsentContext(hooks: Hooks, trackingConsentState: TrackingConsentState) {
  hooks.register(HookNames.AssembleTelemetry, () => {
    const wasConsented = trackingConsentState.isGranted()

    if (!wasConsented) {
      return DISCARDED
    }

    return SKIPPED
  })
}

export function trackingConsentDecoratorFactory(deps: {
  hasConsent: () => boolean
}): DecoratorFactory<Observation, Record<string, never>> {
  return {
    name: 'trackingConsent',
    provides: [],
    requires: [],
    capabilities: { canDiscard: true },
    create: () => ({
      decorate: async (_event, _accumulated) => {
        if (!deps.hasConsent()) {
          return { status: 'discarded', reason: 'no tracking consent' }
        }
        return { status: 'skipped' }
      },
    }),
  }
}
