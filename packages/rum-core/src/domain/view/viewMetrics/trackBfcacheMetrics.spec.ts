import type { Duration, RelativeTime } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

describe('trackBfcacheMetrics', () => {
  let originalRAF: typeof requestAnimationFrame
  let originalPerformanceNow: () => number
  let clock: Clock
  const configuration = mockRumConfiguration()
  let stopTrackBfcacheMetrics: () => void

  beforeEach(() => {
    originalRAF = window.requestAnimationFrame
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(performance.now())
      return 0
    }
    clock = mockClock()
    originalPerformanceNow = performance.now.bind(performance)
    stopTrackBfcacheMetrics = noop
  })

  afterEach(() => {
    stopTrackBfcacheMetrics()
    window.requestAnimationFrame = originalRAF
    performance.now = originalPerformanceNow
    clock.cleanup()
  })

  function createPageshowEvent(timeStamp: number): PageTransitionEvent {
    const event = createNewEvent('pageshow', { __ddIsTrusted: true }) as PageTransitionEvent
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    return event
  }

  it('should compute FCP and LCP from the next frame after BFCache restore', () => {
    const pageshow = createPageshowEvent(100)

    const metrics: InitialViewMetrics = {}
    const scheduleSpy = jasmine.createSpy('schedule')

    performance.now = () => 150

    const { stop } = trackBfcacheMetrics(configuration, pageshow, metrics, scheduleSpy)
    stopTrackBfcacheMetrics = stop

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })
})
