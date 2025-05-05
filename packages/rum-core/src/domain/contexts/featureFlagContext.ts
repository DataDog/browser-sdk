import type { ContextValue, Context } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, createValueHistory, isEmptyObject } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames, SKIPPED } from '../../hooks'

import { RumEventType } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'

export const FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type FeatureFlagContext = Context

export interface FeatureFlagContexts {
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
  hooks: Hooks,
  configuration: RumConfiguration
): FeatureFlagContexts {
  const featureFlagContexts = createValueHistory<FeatureFlagContext>({
    expireDelay: FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY,
  })

  lifeCycle.subscribe(LifeCycleEventType.BEFORE_VIEW_CREATED, ({ startClocks }) => {
    featureFlagContexts.add({}, startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, ({ endClocks }) => {
    featureFlagContexts.closeActive(endClocks.relative)
  })

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): PartialRumEvent | SKIPPED => {
    const trackFeatureFlagsForEvents = (configuration.trackFeatureFlagsForEvents as RumEventType[]).concat([
      RumEventType.VIEW,
      RumEventType.ERROR,
    ])
    if (!trackFeatureFlagsForEvents.includes(eventType as RumEventType)) {
      return SKIPPED
    }

    const featureFlagContext = featureFlagContexts.find(startTime)
    if (!featureFlagContext || isEmptyObject(featureFlagContext)) {
      return SKIPPED
    }

    return {
      type: eventType,
      feature_flags: featureFlagContext,
    }
  })

  return {
    addFeatureFlagEvaluation: (key: string, value: ContextValue) => {
      const currentContext = featureFlagContexts.find()
      if (currentContext) {
        currentContext[key] = value
      }
    },
  }
}
