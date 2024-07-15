import type { Duration, RelativeTime } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  const lifeCycle = new LifeCycle()
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>

  beforeEach(() => {
    const configuration = {} as RumConfiguration
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()

    trackInitialViewMetricsResult = trackInitialViewMetrics(
      lifeCycle,
      configuration,
      setLoadEventSpy,
      scheduleViewUpdateSpy
    )

    registerCleanupTask(trackInitialViewMetricsResult.stop)
  })

  it('should merge metrics from various sources', () => {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
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
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(567 as Duration)
  })
})
