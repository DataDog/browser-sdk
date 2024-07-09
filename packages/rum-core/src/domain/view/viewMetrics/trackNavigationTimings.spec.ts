import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry, mockPerformanceObserver, mockPerformanceTiming } from '../../../../test'
import type { RumConfiguration } from '../../configuration'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'

describe('trackNavigationTimings', () => {
  let navigationTimingsCallback: jasmine.Spy<(timings: NavigationTimings) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let stop: () => void
  let clock: Clock

  function removePerformanceObserver() {
    const originalPerformanceObserver = window.PerformanceObserver
    window.PerformanceObserver = undefined as any

    registerCleanupTask(() => {
      window.PerformanceObserver = originalPerformanceObserver
    })
  }

  beforeEach(() => {
    navigationTimingsCallback = jasmine.createSpy()
  })

  afterEach(() => {
    stop()
    clock?.cleanup()
  })

  it('should provide navigation timing', () => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    stop = trackNavigationTimings({} as RumConfiguration, navigationTimingsCallback).stop
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])

    expect(navigationTimingsCallback).toHaveBeenCalledOnceWith({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })

  it('should discard incomplete navigation timing', () => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    stop = trackNavigationTimings({} as RumConfiguration, navigationTimingsCallback).stop
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, { loadEventEnd: 0 as RelativeTime }),
    ])

    expect(navigationTimingsCallback).not.toHaveBeenCalled()
  })

  it('should provide navigation timing when navigation timing is not supported ', () => {
    clock = mockClock(new Date(0))
    mockPerformanceTiming()
    removePerformanceObserver()

    stop = trackNavigationTimings({} as RumConfiguration, navigationTimingsCallback).stop
    clock.tick(0)

    expect(navigationTimingsCallback).toHaveBeenCalledOnceWith({
      firstByte: undefined,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })
})
