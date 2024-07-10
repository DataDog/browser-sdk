import type { CustomerDataTracker, RelativeTime } from '@datadog/browser-core'
import { relativeToClocks, createCustomerDataTracker, noop } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { FeatureFlagContexts } from './featureFlagContext'
import { startFeatureFlagContexts } from './featureFlagContext'

describe('featureFlagContexts', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let customerDataTracker: CustomerDataTracker
  let featureFlagContexts: FeatureFlagContexts

  beforeEach(() => {
    clock = mockClock()
    customerDataTracker = createCustomerDataTracker(noop)
    featureFlagContexts = startFeatureFlagContexts(lifeCycle, customerDataTracker)
  })

  afterEach(() => {
    clock.cleanup()
    featureFlagContexts.stop()
  })

  it('should return undefined before the initial view', () => {
    expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
  })

  describe('addFeatureFlagEvaluation', () => {
    it('should add feature flag evaluations of any type', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 2)
      featureFlagContexts.addFeatureFlagEvaluation('feature3', true)
      featureFlagContexts.addFeatureFlagEvaluation('feature4', { foo: 'bar' })

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toEqual({
        feature: 'foo',
        feature2: 2,
        feature3: true,
        feature4: { foo: 'bar' },
      })
    })

    it('should replace existing feature flag evaluation to the current context', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'baz')
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'bar')

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toEqual({ feature: 'bar', feature2: 'baz' })
    })

    it('should notify the customer data tracker on feature flag evaluation', () => {
      const updateCustomerDataSpy = spyOn(customerDataTracker, 'updateCustomerData')

      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')

      expect(updateCustomerDataSpy).toHaveBeenCalledWith({ feature: 'foo' })
    })
  })

  describe('findFeatureFlagEvaluations', () => {
    /**
     * It could happen if there is an event happening just between view end and view creation
     * (which seems unlikely) and this event would anyway be rejected by lack of view id
     */
    it('should return undefined when no current view', () => {
      expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
    })

    it('should clear feature flag context on new view', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!
      expect(featureFlagContext).toEqual({})
    })

    it('should return the feature flag context corresponding to the start time', () => {
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

      expect(featureFlagContexts.findFeatureFlagEvaluations(5 as RelativeTime)).toEqual({ feature: 'one' })
      expect(featureFlagContexts.findFeatureFlagEvaluations(15 as RelativeTime)).toEqual({ feature: 'two' })
    })
  })
})
