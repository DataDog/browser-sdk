import type { Duration, RelativeTime } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '@datadog/browser-rum-core'
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

function trackInitialFirstHidden(configuration: RumConfiguration, eventTarget: Window = window) {
  const firstHidden = trackFirstHidden(configuration, eventTarget)

  if (supportPerformanceTimingEvent(RumPerformanceEntryType.VISIBILITY_STATE)) {
    const firstHiddenEntry = performance
      .getEntriesByType(RumPerformanceEntryType.VISIBILITY_STATE)
      .find((entry) => entry.name === 'hidden')
    if (firstHiddenEntry) {
      return {
        timeStamp: (firstHidden.timeStamp > firstHiddenEntry.startTime
          ? firstHiddenEntry.startTime
          : firstHidden.timeStamp) as RelativeTime,
        stop: noop,
      }
    }
  }

  return firstHidden
}

export function trackInitialViewMetrics(
  configuration: RumConfiguration,
  setLoadEvent: (loadEnd: Duration) => void,
  scheduleViewUpdate: () => void
) {
  const initialViewMetrics: InitialViewMetrics = {}

  const { stop: stopNavigationTracking } = trackNavigationTimings(configuration, (navigationTimings) => {
    setLoadEvent(navigationTimings.loadEvent)
    initialViewMetrics.navigationTimings = navigationTimings
    scheduleViewUpdate()
  })

  const firstHidden = trackInitialFirstHidden(configuration)
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
