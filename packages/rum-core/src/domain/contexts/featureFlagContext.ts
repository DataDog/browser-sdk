import type { RelativeTime, ContextValue, Context } from '@datadog/browser-core'
import {
  jsonStringify,
  computeBytesCount,
  noop,
  isExperimentalFeatureEnabled,
  SESSION_TIME_OUT_DELAY,
  ContextHistory,
  sanitize,
} from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export const FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export type FeatureFlagContext = Context

export interface FeatureFlagContexts {
  findFeatureFlagEvaluations: (startTime?: RelativeTime) => FeatureFlagContext | undefined
  getFeatureFlagBytesCount: () => number
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
export function startFeatureFlagContexts(
  lifeCycle: LifeCycle,
  computeBytesCountImpl = computeBytesCount
): FeatureFlagContexts {
  if (!isExperimentalFeatureEnabled('feature_flags')) {
    return {
      findFeatureFlagEvaluations: () => undefined,
      getFeatureFlagBytesCount: () => 0,
      addFeatureFlagEvaluation: noop,
    }
  }

  const featureFlagContexts = new ContextHistory<FeatureFlagContext>(FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY)
  let bytesCountCache: number | undefined

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    featureFlagContexts.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ startClocks }) => {
    featureFlagContexts.add({}, startClocks.relative)
    bytesCountCache = undefined
  })

  return {
    findFeatureFlagEvaluations: (startTime?: RelativeTime) => featureFlagContexts.find(startTime),
    getFeatureFlagBytesCount: () => {
      const currentContext = featureFlagContexts.find()
      if (!currentContext) {
        return 0
      }

      if (bytesCountCache === undefined) {
        bytesCountCache = computeBytesCountImpl(jsonStringify(currentContext)!)
      }
      return bytesCountCache
    },
    addFeatureFlagEvaluation: (key: string, value: ContextValue) => {
      const currentContext = featureFlagContexts.find()
      if (currentContext) {
        currentContext[key] = sanitize(value) as ContextValue
        bytesCountCache = undefined
      }
    },
  }
}
