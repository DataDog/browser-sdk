import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { Duration } from '@datadog/js-core/time'
import { clocksOrigin } from '@datadog/js-core/time'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import { trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  let clock: Clock
  let scheduleViewUpdateSpy: Mock<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: Mock<(loadEvent: Duration) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    const configuration = mockRumConfiguration()
    scheduleViewUpdateSpy = vi.fn()
    setLoadEventSpy = vi.fn()
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
      navigationTimings: expect.any(Object),
      firstContentfulPaint: 123 as Duration,
    })
  })

  it('calls the `setLoadEvent` callback when the loadEvent timing is known', () => {
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.PAINT)])

    clock.tick(0)

    expect(setLoadEventSpy).toHaveBeenCalledTimes(1)
    expect(setLoadEventSpy).toHaveBeenCalledWith(expect.any(Number))
  })
})
