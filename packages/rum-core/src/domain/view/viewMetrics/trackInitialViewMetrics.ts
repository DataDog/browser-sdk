import type { ClocksState, Duration } from '@datadog/browser-core'
import { clocksOrigin } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  navigationTimings?: NavigationTimings
  largestContentfulPaint?: LargestContentfulPaint
  firstInput?: FirstInput
}

export function trackInitialViewMetrics(
  configuration: RumConfiguration,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void,
  viewStart: ClocksState = clocksOrigin()
) {
  const initialViewMetrics: InitialViewMetrics = {}

  const { stop: stopNavigationTracking } = trackNavigationTimings(configuration, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    initialViewMetrics.navigationTimings = navigationTimings
    scheduleViewUpdate()
  })

  const firstHidden = trackFirstHidden(configuration, window, { viewStart })
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(configuration, firstHidden, (firstContentfulPaint) => {
    initialViewMetrics.firstContentfulPaint = firstContentfulPaint
    scheduleViewUpdate()
  })

  const { stop: stopLCPTracking } = trackLargestContentfulPaint(
    configuration,
    firstHidden,
    window,
    (largestContentfulPaint) => {
      initialViewMetrics.largestContentfulPaint = largestContentfulPaint
      scheduleViewUpdate()
    }
  )

  const { stop: stopFIDTracking } = trackFirstInput(configuration, firstHidden, (firstInput) => {
    initialViewMetrics.firstInput = firstInput
    scheduleViewUpdate()
  })

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
