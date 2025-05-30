import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

describe('trackBfcacheMetrics', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()

    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback): number => {
      cb(performance.now())
      return 0
    })
  })

  function createPageshowEvent() {
    return createNewEvent('pageshow', { timeStamp: performance.now() })
  }

  it('should compute FCP and LCP from the next frame after BFCache restore', () => {
    const pageshow = createPageshowEvent() as PageTransitionEvent

    const metrics: InitialViewMetrics = {}
    const scheduleSpy = jasmine.createSpy('schedule')

    clock.tick(50)

    const startClocks = {
      relative: pageshow.timeStamp as RelativeTime,
      timeStamp: 0 as TimeStamp,
    }
    trackBfcacheMetrics(startClocks, metrics, scheduleSpy)

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })
})
