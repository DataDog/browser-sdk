import type { RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT, resetExperimentalFeatures } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility, createNewEvent } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { TestSetupBuilder } from '../../../../test'
import { appendElement, createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackLargestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(lcp: LargestContentfulPaint) => void>
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
    restorePageVisibility()
    resetExperimentalFeatures()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
    ])

    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith({ value: 789 as RelativeTime, targetSelector: undefined })
  })

  it('should provide the largest contentful paint target selector', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        element: appendElement('<button id="lcp-target-element"></button>'),
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith({ value: 789 as RelativeTime, targetSelector: '#lcp-target-element' })
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
