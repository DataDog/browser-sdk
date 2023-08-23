import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { ViewLoadingType } from '../../../../rawRumEvent.types'
import type { RumConfiguration } from '../../../configuration'
import type { LifeCycle } from '../../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import { computeScrollValues, trackScrollMetrics, type ScrollMetrics } from './trackScrollMetrics'
import { trackLoadingTime } from './trackLoadingTime'
import { isLayoutShiftSupported, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'

export interface ViewMetrics {
  loadingTime?: Duration
  cumulativeLayoutShift?: number
}

export function trackViewMetrics(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  scheduleViewUpdate: () => void,
  loadingType: ViewLoadingType,
  viewStart: ClocksState,
  webVitalTelemetryDebug: WebVitalTelemetryDebug
) {
  const viewMetrics: ViewMetrics = {}

  let scrollMetrics: ScrollMetrics | undefined

  const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
    lifeCycle,
    domMutationObservable,
    configuration,
    loadingType,
    viewStart,
    (newLoadingTime) => {
      viewMetrics.loadingTime = newLoadingTime

      // We compute scroll metrics at loading time to ensure we have scroll data when loading the view initially
      // This is to ensure that we have the depth data even if the user didn't scroll or if the view is not scrollable.
      const { scrollHeight, scrollDepth, scrollTop } = computeScrollValues()

      scrollMetrics = {
        maxDepth: scrollDepth,
        maxDepthScrollHeight: scrollHeight,
        maxDepthTime: newLoadingTime,
        maxDepthScrollTop: scrollTop,
      }
      scheduleViewUpdate()
    }
  )

  const { stop: stopScrollMetricsTracking } = trackScrollMetrics(
    configuration,
    viewStart,
    (newScrollMetrics) => {
      scrollMetrics = newScrollMetrics
    },
    computeScrollValues
  )

  let stopCLSTracking: () => void
  let clsAttributionCollected = false
  if (isLayoutShiftSupported()) {
    viewMetrics.cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(
      lifeCycle,
      (cumulativeLayoutShift, largestLayoutShiftNode, largestLayoutShiftTime) => {
        viewMetrics.cumulativeLayoutShift = cumulativeLayoutShift

        if (!clsAttributionCollected) {
          clsAttributionCollected = true
          webVitalTelemetryDebug.addWebVitalTelemetryDebug('CLS', largestLayoutShiftNode, largestLayoutShiftTime)
        }
        scheduleViewUpdate()
      }
    ))
  } else {
    stopCLSTracking = noop
  }

  return {
    stop: () => {
      stopLoadingTimeTracking()
      stopCLSTracking()
      stopScrollMetricsTracking()
    },
    setLoadEvent,
    viewMetrics,
    getScrollMetrics: () => scrollMetrics,
  }
}
