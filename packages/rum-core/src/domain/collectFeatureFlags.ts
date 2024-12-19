import type { Context, RelativeTime } from '@datadog/browser-core'
import { includes, isEmptyObject } from '@datadog/browser-core'
import type { FeatureFlagEvent } from './configuration'
import type { FeatureFlagContexts } from './contexts/featureFlagContext'

export function featureFlagCollection(
  eventType: FeatureFlagEvent,
  eventStartTime: RelativeTime,
  collectFeatureFlagsOn: FeatureFlagEvent[],
  featureFlagContexts: FeatureFlagContexts,
  rawRumEvent: { feature_flags?: Context }
) {
  if (includes(collectFeatureFlagsOn, eventType)) {
    const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(eventStartTime)
    if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
      rawRumEvent.feature_flags = featureFlagContext
    }
  }
}
