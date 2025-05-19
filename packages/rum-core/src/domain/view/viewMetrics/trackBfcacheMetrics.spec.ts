import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

describe('trackBfcacheMetrics', () => {
  let originalRAF: typeof requestAnimationFrame
  let originalPerformanceNow: () => number
  let clock: Clock

  beforeEach(() => {
    originalRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(performance.now())
      return 0
    }

    clock = mockClock()
    originalPerformanceNow = performance.now.bind(performance)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    performance.now = originalPerformanceNow
    clock.cleanup()
  })

  function createPageshowEvent(timeStamp: number): PageTransitionEvent {
    const event = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    return event
  }

  it('should compute FCP and LCP from the next frame after BFCache restore', () => {
    const pageshow = createPageshowEvent(100)

    const metrics: InitialViewMetrics = {}
    const scheduleSpy = jasmine.createSpy('schedule')

    performance.now = () => 150

    trackBfcacheMetrics(pageshow, metrics, scheduleSpy)

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it('should compute FID (delay 0) and time from the next frame', () => {
    const pageshow = createPageshowEvent(200)

    const metrics: InitialViewMetrics = {}
    const scheduleSpy = jasmine.createSpy('schedule')

    performance.now = () => 260

    trackBfcacheMetrics(pageshow, metrics, scheduleSpy)

    expect(metrics.firstInput?.delay).toEqual(0 as Duration)
    expect(metrics.firstInput?.time).toEqual(60 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })
})
