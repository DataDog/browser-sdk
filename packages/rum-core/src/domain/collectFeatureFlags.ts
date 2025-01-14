import type { Context, RelativeTime } from '@datadog/browser-core'
import { includes, isEmptyObject } from '@datadog/browser-core'
import type { FeatureFlagsForEvents } from './configuration'
import type { FeatureFlagContexts } from './contexts/featureFlagContext'

export function featureFlagCollection(
  eventType: FeatureFlagsForEvents,
  eventStartTime: RelativeTime,
  trackFeatureFlagsForEvents: FeatureFlagsForEvents[],
  featureFlagContexts: FeatureFlagContexts,
  rawRumEvent: { feature_flags?: Context }
) {
  if (includes(trackFeatureFlagsForEvents, eventType)) {
    const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(eventStartTime)
    if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
      rawRumEvent.feature_flags = featureFlagContext
    }
  }
}
