import type { ContextValue } from '@datadog/browser-core'
import { HookNames, SESSION_TIME_OUT_DELAY, SKIPPED, createValueHistory } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { RumEventType } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

export const FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type FeatureFlagCollection = Map<string, ContextValue>

export interface FeatureFlagContexts {
  addFeatureFlagEvaluation: (key: string, value: ContextValue) => void
}

export function createFeatureFlagCollection(): FeatureFlagCollection {
  return new Map()
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
  configuration: RumConfiguration,
  initialCollection: FeatureFlagCollection
): FeatureFlagContexts {
  const featureFlagContexts = createValueHistory<FeatureFlagCollection>({
    expireDelay: FEATURE_FLAG_CONTEXT_TIME_OUT_DELAY,
  })

  let isFirstView = true
  lifeCycle.subscribe(LifeCycleEventType.BEFORE_VIEW_CREATED, ({ startClocks }) => {
    const collection = isFirstView ? initialCollection : createFeatureFlagCollection()
    isFirstView = false
    featureFlagContexts.add(collection, startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, ({ endClocks }) => {
    featureFlagContexts.closeActive(endClocks.relative)
  })

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): DefaultRumEventAttributes | SKIPPED => {
    const trackFeatureFlagsForEvents = (configuration.trackFeatureFlagsForEvents as RumEventType[]).concat([
      RumEventType.VIEW,
      RumEventType.ERROR,
    ])
    if (!trackFeatureFlagsForEvents.includes(eventType as RumEventType)) {
      return SKIPPED
    }

    const featureFlagContext = featureFlagContexts.find(startTime)
    if (!featureFlagContext || featureFlagContext.size === 0) {
      return SKIPPED
    }

    return {
      type: eventType,
      feature_flags: Object.fromEntries(featureFlagContext),
    }
  })

  return {
    addFeatureFlagEvaluation: (key: string, value: ContextValue) => {
      const currentCollection = featureFlagContexts.find()
      if (currentCollection) {
        currentCollection.set(key, value)
      }
    },
  }
}
