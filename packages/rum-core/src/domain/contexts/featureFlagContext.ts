import type { RelativeTime, ContextValue, Context } from '@datadog/browser-core'
import {
  deepClone,
  noop,
  isExperimentalFeatureEnabled,
  SESSION_TIME_OUT_DELAY,
  ContextHistory,
} from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export const FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export type FeatureFlagContext = Context

export interface FeatureFlagContexts {
  findFeatureFlagEvaluations: (startTime?: RelativeTime) => FeatureFlagContext | undefined
  addFeatureFlagEvaluation: (key: string, value: ContextValue) => void
}

/**
 * Start feature flag contexts
 *
 * Feature flag contexts follow the life of views.
 * A new context is added when a view is created and ended when the view is ended
 *
 * Note: we choose not to add a new context at each evaluation to save memory
 */
export function startFeatureFlagContexts(lifeCycle: LifeCycle): FeatureFlagContexts {
  if (!isExperimentalFeatureEnabled('feature_flags')) {
    return {
      findFeatureFlagEvaluations: () => undefined,
      addFeatureFlagEvaluation: noop,
    }
  }

  const featureFlagContexts = new ContextHistory<FeatureFlagContext>(FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY)

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    featureFlagContexts.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ startClocks }) => {
    featureFlagContexts.add({}, startClocks.relative)
  })

  return {
    findFeatureFlagEvaluations: (startTime?: RelativeTime) => featureFlagContexts.find(startTime),
    addFeatureFlagEvaluation: (key: string, value: ContextValue) => {
      const currentContext = featureFlagContexts.find()
      if (currentContext) {
        currentContext[key] = deepClone(value)
      }
    },
  }
}
