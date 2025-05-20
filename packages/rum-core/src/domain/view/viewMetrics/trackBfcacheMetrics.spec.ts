import type { Duration, RelativeTime } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../test'
import { trackBfcacheMetrics } from './trackBfcacheMetrics'
import type { InitialViewMetrics } from './trackInitialViewMetrics'

describe('trackBfcacheMetrics', () => {
  let clock: Clock
  let stopTrackBfcacheMetrics: () => void

  beforeEach(() => {
    clock = mockClock()
    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback): number => {
      cb(performance.now())
      return 0
    })
    stopTrackBfcacheMetrics = noop
  })

  afterEach(() => {
    stopTrackBfcacheMetrics()
    clock.cleanup()
  })

  function createPageshowEvent(timeStamp: number) {
    return createNewEvent('pageshow', { timeStamp })
  }

  it('should compute FCP and LCP from the next frame after BFCache restore', () => {
    const pageshow = createPageshowEvent(100) as PageTransitionEvent

    const metrics: InitialViewMetrics = {}
    const scheduleSpy = jasmine.createSpy('schedule')

    performance.now = () => 150

    const { stop } = trackBfcacheMetrics(mockRumConfiguration(), pageshow, metrics, scheduleSpy)
    registerCleanupTask(stop)

    expect(metrics.firstContentfulPaint).toEqual(50 as Duration)
    expect(metrics.largestContentfulPaint?.value).toEqual(50 as RelativeTime)
    expect(scheduleSpy).toHaveBeenCalled()
  })

  it('should update firstInput metric and call scheduleViewUpdate', () => {
    const metrics: InitialViewMetrics = {}
    const scheduleViewUpdate = jasmine.createSpy('scheduleViewUpdate')

    const pageshow = createPageshowEvent(0) as PageTransitionEvent

    trackBfcacheMetrics(mockRumConfiguration(), pageshow, metrics, scheduleViewUpdate)

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
