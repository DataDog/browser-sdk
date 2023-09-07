import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { assign, noop } from '@datadog/browser-core'
import type { ViewLoadingType } from '../../../../rawRumEvent.types'
import type { RumConfiguration } from '../../../configuration'
import type { LifeCycle } from '../../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import type { ScrollMetrics } from './trackScrollMetrics'
import { computeScrollValues, trackScrollMetrics } from './trackScrollMetrics'
import { trackLoadingTime } from './trackLoadingTime'
import { isLayoutShiftSupported, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { trackInteractionToNextPaint } from './trackInteractionToNextPaint'

export interface CommonViewMetrics {
  loadingTime?: Duration
  cumulativeLayoutShift?: number
  interactionToNextPaint?: Duration
  scroll?: ScrollMetrics
}

export function trackCommonViewMetrics(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  scheduleViewUpdate: () => void,
  loadingType: ViewLoadingType,
  viewStart: ClocksState,
  webVitalTelemetryDebug: WebVitalTelemetryDebug
) {
  const commonViewMetrics: CommonViewMetrics = {}

  const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
    lifeCycle,
    domMutationObservable,
    configuration,
    loadingType,
    viewStart,
    (newLoadingTime) => {
      commonViewMetrics.loadingTime = newLoadingTime
      scheduleViewUpdate()
    }
  )

  const { stop: stopScrollMetricsTracking } = trackScrollMetrics(
    configuration,
    viewStart,
    (newScrollMetrics) => {
      commonViewMetrics.scroll = assign(newScrollMetrics, {
        maxDepth: Math.min(newScrollMetrics.maxDepth, newScrollMetrics.maxDepthScrollHeight),
      })
    },
    computeScrollValues
  )

  let stopCLSTracking: () => void
  let clsAttributionCollected = false
  if (isLayoutShiftSupported()) {
    commonViewMetrics.cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(
      lifeCycle,
      (cumulativeLayoutShift, largestLayoutShiftNode, largestLayoutShiftTime) => {
        commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift

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

  const { stop: stopINPTracking, getInteractionToNextPaint } = trackInteractionToNextPaint(loadingType, lifeCycle)

  return {
    stop: () => {
      stopLoadingTimeTracking()
      stopCLSTracking()
      stopScrollMetricsTracking()
      stopINPTracking()
    },
    setLoadEvent,
    getCommonViewMetrics: () => {
      commonViewMetrics.interactionToNextPaint = getInteractionToNextPaint()
      return commonViewMetrics
    },
  }
}
