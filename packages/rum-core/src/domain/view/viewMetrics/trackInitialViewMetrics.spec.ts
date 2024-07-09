import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { TestSetupBuilder } from '../../../../test'
import { createPerformanceEntry, mockPerformanceObserver, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  let setupBuilder: TestSetupBuilder
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>
  let configuration: RumConfiguration
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  beforeEach(() => {
    configuration = {} as RumConfiguration
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      trackInitialViewMetricsResult = trackInitialViewMetrics(
        lifeCycle,
        configuration,
        setLoadEventSpy,
        scheduleViewUpdateSpy
      )
      return trackInitialViewMetricsResult
    })
  })

  it('should merge metrics from various sources', () => {
    const { lifeCycle } = setupBuilder.build()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
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
    const { lifeCycle } = setupBuilder.build()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(567 as Duration)
  })
})
