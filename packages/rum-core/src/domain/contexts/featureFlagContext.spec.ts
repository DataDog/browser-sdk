import type { RelativeTime } from '@datadog/browser-core'
import { relativeToClocks } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { Hooks } from '../../hooks'
import { createHooks, HookNames } from '../../hooks'
import type { RumConfiguration } from '../configuration'
import { RumEventType } from '../../rawRumEvent.types'
import type { FeatureFlagContexts } from './featureFlagContext'
import { startFeatureFlagContexts } from './featureFlagContext'

describe('featureFlagContexts', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let featureFlagContexts: FeatureFlagContexts
  let hooks: Hooks
  let trackFeatureFlagsForEvents: any[]

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
    trackFeatureFlagsForEvents = []
    featureFlagContexts = startFeatureFlagContexts(lifeCycle, hooks, {
      trackFeatureFlagsForEvents,
    } as unknown as RumConfiguration)

    registerCleanupTask(() => {
      clock.cleanup()
    })
  })

  describe('assemble hook', () => {
    it('should add feature flag evaluations on VIEW and ERROR by default ', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')

      const defaultViewAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })
      const defaultErrorAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'error',
        startTime: 0 as RelativeTime,
      })

      expect(defaultViewAttributes).toEqual({
        type: 'view',
        feature_flags: {
          feature: 'foo',
        },
      })

      expect(defaultErrorAttributes).toEqual({
        type: 'error',
        feature_flags: {
          feature: 'foo',
        },
      })
    })
    ;[RumEventType.VITAL, RumEventType.ACTION, RumEventType.LONG_TASK, RumEventType.RESOURCE].forEach((eventType) => {
      it(`should add feature flag evaluations on ${eventType} when specified in trackFeatureFlagsForEvents`, () => {
        trackFeatureFlagsForEvents.push(eventType)
        lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
          startClocks: relativeToClocks(0 as RelativeTime),
        } as ViewCreatedEvent)

        featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')

        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: 0 as RelativeTime,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: eventType,
          feature_flags: {
            feature: 'foo',
          },
        })
      })
    })

    it('should add feature flag evaluations of any type', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 2)
      featureFlagContexts.addFeatureFlagEvaluation('feature3', true)
      featureFlagContexts.addFeatureFlagEvaluation('feature4', { foo: 'bar' })

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({
        type: 'view',
        feature_flags: {
          feature: 'foo',
          feature2: 2,
          feature3: true,
          feature4: { foo: 'bar' },
        },
      })
    })

    it('should add feature flag evaluations corresponding to the view start time', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'one')
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'two')

      const defaultEventOneAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 5 as RelativeTime,
      })
      const defaultEventTwoAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 15 as RelativeTime,
      })

      expect(defaultEventOneAttributes).toEqual({ type: 'view', feature_flags: { feature: 'one' } })
      expect(defaultEventTwoAttributes).toEqual({ type: 'view', feature_flags: { feature: 'two' } })
    })

    /**
     * It could happen if there is an event happening just between view end and view creation
     * (which seems unlikely) and this event would anyway be rejected by lack of view id
     */
    it('should not add feature flag evaluations when no current view', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toBeUndefined()
    })

    it('should replace existing feature flag evaluations for the current view', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'baz')
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'bar')

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      })

      expect(defaultRumEventAttributes).toEqual({ type: 'view', feature_flags: { feature: 'bar', feature2: 'baz' } })
    })
  })
})
