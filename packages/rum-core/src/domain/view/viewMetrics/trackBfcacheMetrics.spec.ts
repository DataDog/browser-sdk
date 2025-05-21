import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

describe('trackBfcacheMetrics', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    registerCleanupTask(clock.cleanup)

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
    const { stop } = trackBfcacheMetrics(mockRumConfiguration(), startClocks, metrics, scheduleSpy)
    registerCleanupTask(stop)

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it('should update firstInput metric and call scheduleViewUpdate', () => {
    const metrics: InitialViewMetrics = {}
    const scheduleViewUpdate = jasmine.createSpy('scheduleViewUpdate')

    createPageshowEvent() as PageTransitionEvent

    const startClocks = {
      relative: 0 as RelativeTime,
      timeStamp: 0 as TimeStamp,
    }
    const { stop } = trackBfcacheMetrics(mockRumConfiguration(), startClocks, metrics, scheduleViewUpdate)
    registerCleanupTask(stop)

    clock.tick(100)

    const firstInputEvent = createNewEvent('pointerdown', {
      cancelable: true,
    } as Partial<PointerEvent>)

    window.dispatchEvent(firstInputEvent)
    window.dispatchEvent(createNewEvent('pointerup'))

    expect(metrics.firstInput).toBeDefined()
    expect(scheduleViewUpdate).toHaveBeenCalled()
  })
})
