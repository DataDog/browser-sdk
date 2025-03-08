import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { RumConfiguration } from '../../configuration'
import { measureRestoredFCP, measureRestoredLCP, measureRestoredFID } from './cwvPolyfill'
import { trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import type { NavigationTimings } from './trackNavigationTimings'
import { trackNavigationTimings } from './trackNavigationTimings'
import { onBFCacheRestore } from './bfCacheSupport'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

export interface InitialViewMetrics {
  firstContentfulPaint?: Duration
  navigationTimings?: NavigationTimings
  largestContentfulPaint?: LargestContentfulPaint
  firstInput?: FirstInput
  bfCache?: boolean
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

  const firstHidden = trackFirstHidden(configuration)
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

  onBFCacheRestore((pageshowEvent) => {
    initialViewMetrics.bfCache = true
    measureRestoredFCP(pageshowEvent, (restoredFCP) => {
      initialViewMetrics.firstContentfulPaint = restoredFCP
      measureRestoredLCP(pageshowEvent, (restoredLCP) => {
        initialViewMetrics.largestContentfulPaint = { value: restoredLCP } as LargestContentfulPaint
        measureRestoredFID(pageshowEvent, (restoredFID) => {
          initialViewMetrics.firstInput = {
            delay: restoredFID.delay,
            time: restoredFID.time as RelativeTime,
            targetSelector: undefined,
          }
          scheduleViewUpdate()
        })
      })
    })
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
