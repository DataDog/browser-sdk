import type { RelativeTime } from '@datadog/browser-core'
import { clocksOrigin } from '@datadog/browser-core'
import { registerCleanupTask, restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import { FCP_MAXIMUM_DELAY, trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackFirstContentfulPaint', () => {
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startTrackingFCP(activationStart?: RelativeTime) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    fcpCallback = jasmine.createSpy()
    const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
    const firstContentfulPaint = trackFirstContentfulPaint(
      mockRumConfiguration(),
      firstHidden,
      fcpCallback,
      () => activationStart as RelativeTime
    )

    registerCleanupTask(() => {
      firstHidden.stop()
      firstContentfulPaint.stop()
      restorePageVisibility()
    })
  }

  it('should provide the first contentful paint timing', () => {
    startTrackingFCP()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.PAINT)])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    startTrackingFCP()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.PAINT)])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    startTrackingFCP()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.PAINT, { startTime: FCP_MAXIMUM_DELAY as RelativeTime }),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should adjust FCP based on activationStart when prerendered', () => {
    const activationStart = 100 as RelativeTime
    startTrackingFCP(activationStart)

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.PAINT, { startTime: 250 as RelativeTime }),
    ])

    expect(fcpCallback).toHaveBeenCalledWith(150 as RelativeTime)
  })
})
