import type { RelativeTime } from '@datadog/browser-core'
import {
  DOM_EVENT,
  ExperimentalFeature,
  addExperimentalFeatures,
  noop,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility, createNewEvent } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { TestSetupBuilder } from '../../../../test'
import { createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackLargestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(value: RelativeTime, targetSelector?: string) => void>
  let eventTarget: Window
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    lcpCallback = jasmine.createSpy()
    eventTarget = document.createElement('div') as unknown as Window
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      const firstHidden = trackFirstHidden(configuration)
      const largestContentfulPaint = trackLargestContentfulPaint(
        lifeCycle,
        configuration,
        { addWebVitalTelemetryDebug: noop },
        firstHidden,
        eventTarget,
        lcpCallback
      )
      return {
        stop() {
          firstHidden.stop()
          largestContentfulPaint.stop()
        },
      }
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetExperimentalFeatures()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
    ])

    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, undefined)
  })

  it('should provide the largest contentful paint target selector if FF enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.WEB_VITALS_ATTRIBUTION])
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        element: target,
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, '#lcp-target-element')
  })

  it('should not provide the largest contentful paint target selector if FF disabled', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        element: target,
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, undefined)
  })

  it('should be discarded if it is reported after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
    ])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
    ])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: LCP_MAXIMUM_DELAY as RelativeTime,
      }),
    ])

    expect(lcpCallback).not.toHaveBeenCalled()
  })
})
