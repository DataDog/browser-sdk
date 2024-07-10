import type { RelativeTime } from '@datadog/browser-core'
import { setPageVisibility } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { FCP_MAXIMUM_DELAY, trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackFirstContentfulPaint', () => {
  const lifeCycle = new LifeCycle()
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>
  let cleanup: () => void

  function startTrackingFCP() {
    fcpCallback = jasmine.createSpy()
    const firstHidden = trackFirstHidden({} as RumConfiguration)
    const firstContentfulPaint = trackFirstContentfulPaint(lifeCycle, firstHidden, fcpCallback)

    cleanup = () => {
      firstHidden.stop()
      firstContentfulPaint.stop()
    }
  }

  beforeEach(() => {
    startTrackingFCP()
  })

  afterEach(() => {
    cleanup()
  })

  it('should provide the first contentful paint timing', () => {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    // stop the previous setup from the beforeEach
    cleanup()

    setPageVisibility('hidden')
    startTrackingFCP()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT, { startTime: FCP_MAXIMUM_DELAY as RelativeTime }),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})
