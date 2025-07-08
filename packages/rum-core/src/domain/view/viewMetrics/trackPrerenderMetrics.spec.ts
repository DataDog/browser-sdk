import type { RelativeTime, Duration } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../../test'
import type { RumConfiguration } from '../../configuration'
import type { InitialViewMetrics } from './trackInitialViewMetrics'
import { trackPrerenderMetrics } from './trackPrerenderMetrics'

describe('trackPrerenderMetrics', () => {
  let configuration: RumConfiguration
  let metrics: InitialViewMetrics
  let scheduleViewUpdate: jasmine.Spy
  let mockGetActivationStart: jasmine.Spy

  beforeEach(() => {
    configuration = mockRumConfiguration()

    metrics = {
      navigationTimings: {
        firstByte: 100 as Duration,
      },
    } as InitialViewMetrics

    scheduleViewUpdate = jasmine.createSpy('scheduleViewUpdate')
    mockGetActivationStart = jasmine.createSpy('getActivationStart').and.returnValue(50 as RelativeTime)
  })

  describe('when activationStart is available', () => {
    it('should adjust TTFB when activationStart is available', () => {
      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.navigationTimings!.firstByte).toBe(50 as Duration)
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should not adjust metrics when activationStart is 0', () => {
      mockGetActivationStart.and.returnValue(0 as RelativeTime)

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.navigationTimings!.firstByte).toBe(100 as Duration)
      expect(scheduleViewUpdate).not.toHaveBeenCalled()
    })

    it('should adjust FCP when available and greater than activationStart', () => {
      metrics.firstContentfulPaint = 150 as Duration

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.firstContentfulPaint).toBe(100 as Duration)
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should not adjust FCP when less than activationStart', () => {
      metrics.firstContentfulPaint = 30 as Duration

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.firstContentfulPaint).toBe(0 as Duration) 
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should adjust LCP when available and greater than activationStart', () => {
      metrics.largestContentfulPaint = {
        value: 200 as RelativeTime,
        targetSelector: '#lcp-element',
      }

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.largestContentfulPaint.value).toBe(150 as RelativeTime)
      expect(metrics.largestContentfulPaint.targetSelector).toBe('#lcp-element')
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should not adjust LCP when less than activationStart', () => {
      metrics.largestContentfulPaint = {
        value: 30 as RelativeTime,
        targetSelector: '#lcp-element',
      }

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.largestContentfulPaint.value).toBe(0 as RelativeTime)
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should handle multiple metrics adjustments', () => {
      metrics.firstContentfulPaint = 150 as Duration
      metrics.largestContentfulPaint = {
        value: 200 as RelativeTime,
        targetSelector: '#lcp-element',
      }

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(metrics.navigationTimings!.firstByte).toBe(50 as Duration)
      expect(metrics.firstContentfulPaint).toBe(100 as Duration)
      expect(metrics.largestContentfulPaint.value).toBe(150 as RelativeTime)
      expect(scheduleViewUpdate).toHaveBeenCalled()
    })

    it('should not call scheduleViewUpdate when no metrics need adjustment', () => {
      metrics = {} as InitialViewMetrics

      trackPrerenderMetrics(configuration, metrics, scheduleViewUpdate, mockGetActivationStart)

      expect(scheduleViewUpdate).not.toHaveBeenCalled()
    })
  })
})
