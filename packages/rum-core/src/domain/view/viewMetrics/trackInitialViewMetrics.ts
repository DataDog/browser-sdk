import type { Duration } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import type { FirstInputTimings } from './trackFirstInputTimings'
import { trackFirstInputTimings } from './trackFirstInputTimings'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  navigationTimings?: NavigationTimings
  largestContentfulPaint?: LargestContentfulPaint
  firstInputTimings?: FirstInputTimings
}

export function trackInitialViewMetrics(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  webVitalTelemetryDebug: WebVitalTelemetryDebug,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const initialViewMetrics: InitialViewMetrics = {}

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    initialViewMetrics.navigationTimings = navigationTimings
    scheduleViewUpdate()
  })

  const firstHidden = trackFirstHidden(configuration)
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(lifeCycle, firstHidden, (firstContentfulPaint) => {
    initialViewMetrics.firstContentfulPaint = firstContentfulPaint
    scheduleViewUpdate()
  })

  const { stop: stopLCPTracking } = trackLargestContentfulPaint(
    lifeCycle,
    configuration,
    webVitalTelemetryDebug,
    firstHidden,
    window,
    (largestContentfulPaint) => {
      initialViewMetrics.largestContentfulPaint = largestContentfulPaint
      scheduleViewUpdate()
    }
  )

  const { stop: stopFIDTracking } = trackFirstInputTimings(
    lifeCycle,
    configuration,
    webVitalTelemetryDebug,
    firstHidden,
    (firstInputTimings) => {
      initialViewMetrics.firstInputTimings = firstInputTimings
      scheduleViewUpdate()
    }
  )

  function stop() {
    stopNavigationTracking()
    stopFCPTracking()
    stopLCPTracking()
    stopFIDTracking()
    firstHidden.stop()
  }

  return {
    stop,
    initialViewMetrics,
  }
}
