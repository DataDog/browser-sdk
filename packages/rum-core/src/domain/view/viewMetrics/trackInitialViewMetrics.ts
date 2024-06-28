import type { Duration } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  navigationTimings?: NavigationTimings
  largestContentfulPaint?: LargestContentfulPaint
  firstInput?: FirstInput
}

export function trackInitialViewMetrics(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const initialViewMetrics: InitialViewMetrics = {}

  const { stop: stopNavigationTracking } = trackNavigationTimings(lifeCycle, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    initialViewMetrics.navigationTimings = navigationTimings
    scheduleViewUpdate()
  })

  const { stop: stopFCPTracking } = trackFirstContentfulPaint((firstContentfulPaint) => {
    initialViewMetrics.firstContentfulPaint = firstContentfulPaint
    scheduleViewUpdate()
  })

  const { stop: stopLCPTracking } = trackLargestContentfulPaint(configuration, (largestContentfulPaint) => {
    initialViewMetrics.largestContentfulPaint = largestContentfulPaint
    scheduleViewUpdate()
  })

  const { stop: stopFIDTracking } = trackFirstInput(configuration, (firstInput) => {
    initialViewMetrics.firstInput = firstInput
    scheduleViewUpdate()
  })

  function stop() {
    stopNavigationTracking()
    stopFCPTracking()
    stopLCPTracking()
    stopFIDTracking()
  }

  return {
    stop,
    initialViewMetrics,
  }
}
