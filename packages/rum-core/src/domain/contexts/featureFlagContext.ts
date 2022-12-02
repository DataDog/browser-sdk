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
        // mutate the current context to avoid creating a new context history entry to save memory
        currentContext[key] = deepClone(value)
      }
    },
  }
}
