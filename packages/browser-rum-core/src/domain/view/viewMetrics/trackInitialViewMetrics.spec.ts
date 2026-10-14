import type { Duration } from '@datadog/js-core/time'
import { clocksOrigin } from '@datadog/js-core/time'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import { trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  let clock: Clock
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    const configuration = mockRumConfiguration()
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()
    clock = mockClock()

    trackInitialViewMetricsResult = trackInitialViewMetrics(
      configuration,
      clocksOrigin(),
      setLoadEventSpy,
      scheduleViewUpdateSpy
    )

    registerCleanupTask(trackInitialViewMetricsResult.stop)
  })

  it('should merge metrics from various sources', () => {
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    clock.tick(0)

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(2)
    expect(trackInitialViewMetricsResult.initialViewMetrics).toEqual({
      navigationTimings: jasmine.any(Object),
      firstContentfulPaint: 123 as Duration,
    })
  })

  it('does not collect page load metrics without a document', () => {
    trackInitialViewMetricsResult.stop()
    replaceMockable<Document | undefined>(globalObject.document, undefined)
    const result = trackInitialViewMetrics(
      mockRumConfiguration(),
      clocksOrigin(),
      setLoadEventSpy,
      scheduleViewUpdateSpy
    )
    registerCleanupTask(result.stop)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])
    clock.tick(0)

    expect(result.initialViewMetrics).toEqual({})
    expect(scheduleViewUpdateSpy).not.toHaveBeenCalled()
  })

  it('calls the `setLoadEvent` callback when the loadEvent timing is known', () => {
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.PAINT)])

    clock.tick(0)

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(jasmine.any(Number))
  })
})
