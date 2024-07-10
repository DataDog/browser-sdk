import type { Duration } from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'

describe('trackNavigationTimings', () => {
  const lifeCycle = new LifeCycle()
  let navigationTimingsCallback: jasmine.Spy<(timings: NavigationTimings) => void>

  beforeEach(() => {
    navigationTimingsCallback = jasmine.createSpy()
    trackNavigationTimings(lifeCycle, navigationTimingsCallback)
  })

  it('should provide navigation timing', () => {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
    ])

    expect(navigationTimingsCallback).toHaveBeenCalledOnceWith({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })
})
