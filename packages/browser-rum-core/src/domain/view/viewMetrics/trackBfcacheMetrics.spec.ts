import type { RelativeTime, Duration, TimeStamp } from '@datadog/js-core/time'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask, waitAfterNextPaint } from '@datadog/browser-core/test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'

describe('trackBfcacheMetrics', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  function createPageshowEvent() {
    return createNewEvent('pageshow', { timeStamp: performance.now() })
  }

  it('should compute FCP and LCP from the next frame after BFCache restore', async () => {
    const pageshow = createPageshowEvent() as PageTransitionEvent

    const scheduleSpy = jasmine.createSpy('schedule')

    clock.tick(50)

    const startClocks = {
      relative: pageshow.timeStamp as RelativeTime,
      timeStamp: 0 as TimeStamp,
    }
    const { initialViewMetrics: metrics, stop } = trackBfcacheMetrics(startClocks, scheduleSpy)
    registerCleanupTask(stop)

    await waitAfterNextPaint()

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it('does not collect paint metrics when stopped before the first animation frame', async () => {
    const scheduleSpy = jasmine.createSpy('schedule')
    const { initialViewMetrics, stop } = trackBfcacheMetrics(
      { relative: clock.relative(0), timeStamp: clock.timeStamp(0) },
      scheduleSpy
    )
    registerCleanupTask(stop)

    stop()
    await waitAfterNextPaint()

    expect(initialViewMetrics).toEqual({})
    expect(scheduleSpy).not.toHaveBeenCalled()
  })

  it('does not collect paint metrics when stopped before the second animation frame', async () => {
    const scheduleSpy = jasmine.createSpy('schedule')
    const { initialViewMetrics, stop } = trackBfcacheMetrics(
      { relative: clock.relative(0), timeStamp: clock.timeStamp(0) },
      scheduleSpy
    )
    registerCleanupTask(stop)

    requestAnimationFrame(stop)
    await waitAfterNextPaint()

    expect(initialViewMetrics).toEqual({})
    expect(scheduleSpy).not.toHaveBeenCalled()
  })
})
