import type { Duration, RelativeTime } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  let lifeCycle: LifeCycle
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    const configuration = mockRumConfiguration()
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    trackInitialViewMetricsResult = trackInitialViewMetrics(
      lifeCycle,
      configuration,
      setLoadEventSpy,
      scheduleViewUpdateSpy
    )

    registerCleanupTask(trackInitialViewMetricsResult.stop)
  })

  it('should merge metrics from various sources', () => {
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(3)
    expect(trackInitialViewMetricsResult.initialViewMetrics).toEqual({
      navigationTimings: {
        firstByte: 123 as Duration,
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        loadEvent: 567 as Duration,
      },
      firstContentfulPaint: 123 as Duration,
      firstInput: {
        delay: 100 as Duration,
        time: 1000 as RelativeTime,
        targetSelector: undefined,
      },
    })
  })

  it('calls the `setLoadEvent` callback when the loadEvent timing is known', () => {
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(567 as Duration)
  })
})
