import type { RelativeTime } from '@datadog/browser-core'
import { registerCleanupTask, restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { FCP_MAXIMUM_DELAY, trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackFirstContentfulPaint', () => {
  const lifeCycle = new LifeCycle()
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>

  function startTrackingFCP() {
    fcpCallback = jasmine.createSpy()
    const firstHidden = trackFirstHidden({} as RumConfiguration)
    const firstContentfulPaint = trackFirstContentfulPaint(lifeCycle, firstHidden, fcpCallback)

    registerCleanupTask(() => {
      firstHidden.stop()
      firstContentfulPaint.stop()
      restorePageVisibility()
    })
  }

  it('should provide the first contentful paint timing', () => {
    startTrackingFCP()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    startTrackingFCP()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    startTrackingFCP()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT, { startTime: FCP_MAXIMUM_DELAY as RelativeTime }),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})
