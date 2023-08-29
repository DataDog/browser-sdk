import type { Duration } from '@datadog/browser-core'
import { setTimeout, assign, ONE_MINUTE } from '@datadog/browser-core'
import type { RumConfiguration } from '../../../configuration'
import type { LifeCycle } from '../../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstInputTimings } from './trackFirstInputTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'

/**
 * The initial view can finish quickly, before some metrics can be produced (ex: before the page load
 * event, or the first input). Also, we don't want to trigger a view update indefinitely, to avoid
 * updates on views that ended a long time ago. Keep watching for metrics after the view ends for a
 * limited amount of time.
 */
export const KEEP_TRACKING_METRICS_AFTER_VIEW_DELAY = 5 * ONE_MINUTE

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  firstByte?: Duration
  domInteractive?: Duration
  domContentLoaded?: Duration
  domComplete?: Duration
  loadEvent?: Duration
  largestContentfulPaint?: Duration
  firstInputDelay?: Duration
  firstInputTime?: Duration
}

export function trackInitialViewMetrics(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  webVitalTelemetryDebug: WebVitalTelemetryDebug,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const initialViewMetrics: InitialViewMetrics = {}

  function setMetrics(newMetrics: Partial<InitialViewMetrics>) {
    assign(initialViewMetrics, newMetrics)
    scheduleViewUpdate()
  }

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    setMetrics(navigationTimings)
  })
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(lifeCycle, configuration, (firstContentfulPaint) =>
    setMetrics({ firstContentfulPaint })
  )
  const { stop: stopLCPTracking } = trackLargestContentfulPaint(
    lifeCycle,
    configuration,
    window,
    (largestContentfulPaint, lcpElement) => {
      webVitalTelemetryDebug.addWebVitalTelemetryDebug('LCP', lcpElement, largestContentfulPaint)

      setMetrics({
        largestContentfulPaint,
      })
    }
  )

  const { stop: stopFIDTracking } = trackFirstInputTimings(
    lifeCycle,
    configuration,
    ({ firstInputDelay, firstInputTime, firstInputTarget }) => {
      webVitalTelemetryDebug.addWebVitalTelemetryDebug('FID', firstInputTarget, firstInputTime)

      setMetrics({
        firstInputDelay,
        firstInputTime,
      })
    }
  )

  function stop() {
    stopNavigationTracking()
    stopFCPTracking()
    stopLCPTracking()
    stopFIDTracking()
  }

  return {
    stop,
    initialViewMetrics,
    scheduleStop: () => {
      setTimeout(stop, KEEP_TRACKING_METRICS_AFTER_VIEW_DELAY)
    },
  }
}
