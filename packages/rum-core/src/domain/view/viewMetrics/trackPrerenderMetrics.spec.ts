import type { RelativeTime } from '@datadog/browser-core'
import type { InitialViewMetrics } from './trackInitialViewMetrics'
import { trackPrerenderMetrics } from './trackPrerenderMetrics'

describe('trackPrerenderMetrics', () => {
  let scheduleViewUpdateSpy: jasmine.Spy
  let mockInitialViewMetrics: InitialViewMetrics

  beforeEach(() => {
    scheduleViewUpdateSpy = jasmine.createSpy('scheduleViewUpdate')
    mockInitialViewMetrics = {} as InitialViewMetrics
  })

  it('should not adjust metrics when activationStart is 0', () => {
    const getActivationStartSpy = jasmine.createSpy('getActivationStart').and.returnValue(0 as RelativeTime)

    trackPrerenderMetrics(mockInitialViewMetrics, scheduleViewUpdateSpy, getActivationStartSpy)

    expect(getActivationStartSpy).toHaveBeenCalled()
    expect(scheduleViewUpdateSpy).not.toHaveBeenCalled()
  })

  it('should adjust FCP metrics when activationStart > 0', (done) => {
    const getActivationStartSpy = jasmine.createSpy('getActivationStart').and.returnValue(100 as RelativeTime)
    mockInitialViewMetrics.firstContentfulPaint = 250 as RelativeTime

    trackPrerenderMetrics(mockInitialViewMetrics, scheduleViewUpdateSpy, getActivationStartSpy)

    setTimeout(() => {
      expect(getActivationStartSpy).toHaveBeenCalled()
      expect(mockInitialViewMetrics.firstContentfulPaint).toBe(150 as RelativeTime)
      expect(scheduleViewUpdateSpy).toHaveBeenCalled()
      done()
    }, 150)
  })
})
