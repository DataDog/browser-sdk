import type { ClocksState, Duration } from '@datadog/js-core/time'
import { globalObject, noop } from '@datadog/js-core/util'
import type { RumConfiguration } from '../../configuration'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  navigationTimings?: NavigationTimings
  largestContentfulPaint?: LargestContentfulPaint
}

export function trackInitialViewMetrics(
  configuration: RumConfiguration,
  viewStart: ClocksState,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const initialViewMetrics: InitialViewMetrics = {}
  if (!globalObject.document) {
    return { stop: noop, initialViewMetrics }
  }

  const { stop: stopNavigationTracking } = trackNavigationTimings((navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    initialViewMetrics.navigationTimings = navigationTimings
    scheduleViewUpdate()
  })

  const firstHidden = trackFirstHidden(viewStart)
  const { stop: stopFCPTracking } = trackFirstContentfulPaint(firstHidden, (firstContentfulPaint) => {
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

  function stop() {
    stopNavigationTracking()
    stopFCPTracking()
    stopLCPTracking()
    firstHidden.stop()
  }

  return {
    stop,
    initialViewMetrics,
  }
}
