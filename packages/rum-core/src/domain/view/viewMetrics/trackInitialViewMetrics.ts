import type { Duration } from '@datadog/browser-core'
import { assign } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstInputTimings } from './trackFirstInputTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  firstByte?: Duration
  domInteractive?: Duration
  domContentLoaded?: Duration
  domComplete?: Duration
  loadEvent?: Duration
  largestContentfulPaint?: Duration
  largestContentfulPaintTargetSelector?: string
  firstInputDelay?: Duration
  firstInputTime?: Duration
  firstInputTargetSelector?: string
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
  const firstHidden = trackFirstHidden(configuration)
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(lifeCycle, firstHidden, (firstContentfulPaint) =>
    setMetrics({ firstContentfulPaint })
  )
  const { stop: stopLCPTracking } = trackLargestContentfulPaint(
    lifeCycle,
    configuration,
    webVitalTelemetryDebug,
    firstHidden,
    window,
    (largestContentfulPaint, largestContentfulPaintTargetSelector) => {
      setMetrics({
        largestContentfulPaint,
        largestContentfulPaintTargetSelector,
      })
    }
  )

  const { stop: stopFIDTracking } = trackFirstInputTimings(
    lifeCycle,
    configuration,
    webVitalTelemetryDebug,
    firstHidden,
    ({ firstInputDelay, firstInputTime, firstInputTargetSelector }) => {
      setMetrics({
        firstInputDelay,
        firstInputTime,
        firstInputTargetSelector,
      })
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
