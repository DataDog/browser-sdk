import type { RelativeTime } from '@datadog/browser-core'
import {
  display,
  ExperimentalFeature,
  resetExperimentalFeatures,
  addExperimentalFeatures,
  relativeToClocks,
  CUSTOMER_DATA_BYTES_LIMIT,
  createCustomerDataTracker,
  CustomerDataType,
} from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { Clock } from '../../../../core/test'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../view/trackViews'
import type { FeatureFlagContexts } from './featureFlagContext'
import { BYTES_COMPUTATION_THROTTLING_DELAY, startFeatureFlagContexts } from './featureFlagContext'

describe('featureFlagContexts', () => {
  let setupBuilder: TestSetupBuilder
  let featureFlagContexts: FeatureFlagContexts
  let computeBytesCountStub: jasmine.Spy
  let displaySpy: jasmine.Spy<typeof display.warn>
  let fakeBytesCount: number

  beforeEach(() => {
    fakeBytesCount = 1
    displaySpy = spyOn(display, 'warn')
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.callFake(() => fakeBytesCount)
      featureFlagContexts = startFeatureFlagContexts(
        lifeCycle,
        createCustomerDataTracker(CustomerDataType.FeatureFlag, computeBytesCountStub)
      )
    })
  })

  afterEach(() => {
    featureFlagContexts.stop()
    resetExperimentalFeatures()
    setupBuilder.cleanup()
  })

  it('should return undefined before the initial view', () => {
    setupBuilder.build()

    expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
  })

  describe('addFeatureFlagEvaluation', () => {
    it('should add feature flag evaluations of any type when the ff feature_flags is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
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

    it('should replace existing feature flag evaluation to the current context when the ff feature_flags is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'baz')
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'bar')

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toEqual({ feature: 'bar', feature2: 'baz' })
    })

    it('should not add feature flag evaluation when the ff feature_flags is disabled', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toBeUndefined()
    })

    it('should warn once if the context bytes limit is reached', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      fakeBytesCount = CUSTOMER_DATA_BYTES_LIMIT + 1

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      expect(displaySpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('findFeatureFlagEvaluations', () => {
    /**
     * It could happen if there is an event happening just between view end and view creation
     * (which seems unlikely) and this event would anyway be rejected by lack of view id
     */
    it('should return undefined when no current view', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      setupBuilder.build()

      expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
    })

    it('should clear feature flag context on new view', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!
      expect(featureFlagContext).toEqual({})
    })

    it('should return the feature flag context corresponding to the start time', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'one')
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'two')

      expect(featureFlagContexts.findFeatureFlagEvaluations(5 as RelativeTime)).toEqual({ feature: 'one' })
      expect(featureFlagContexts.findFeatureFlagEvaluations(15 as RelativeTime)).toEqual({ feature: 'two' })
    })
  })

  describe('bytes count computation', () => {
    let clock: Clock
    let lifeCycle: LifeCycle

    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])
      ;({ clock, lifeCycle } = setupBuilder.withFakeClock().build())
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)
    })

    it('should be done each time the context is updated', () => {
      featureFlagContexts.addFeatureFlagEvaluation('feature1', 'foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'bar')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      // feature flags are cleared when a view is created
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)
      const bytesCount = featureFlagContexts.getFeatureFlagBytesCount()

      expect(bytesCount).toEqual(0)
      expect(computeBytesCountStub).toHaveBeenCalledTimes(2)
    })

    it('should be throttled to minimize the impact on performance', () => {
      featureFlagContexts.addFeatureFlagEvaluation('feature1', 'foo') // leading call executed synchronously
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'bar') // ignored
      featureFlagContexts.addFeatureFlagEvaluation('feature3', 'baz') // trailing call executed after BYTES_COMPUTATION_THROTTLING_DELAY
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      expect(computeBytesCountStub).toHaveBeenCalledTimes(2)
    })
  })
})
