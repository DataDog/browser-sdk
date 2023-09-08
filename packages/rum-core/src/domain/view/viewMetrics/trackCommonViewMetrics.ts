import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import type { ScrollMetrics } from './trackScrollMetrics'
import { computeScrollValues, trackScrollMetrics } from './trackScrollMetrics'
import { trackLoadingTime } from './trackLoadingTime'
import { isLayoutShiftSupported, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { trackInteractionToNextPaint } from './trackInteractionToNextPaint'

export interface CommonViewMetrics {
  loadingTime?: Duration
  cumulativeLayoutShift?: number
  cumulativeLayoutShiftTargetSelector?: string
  interactionToNextPaint?: Duration
  interactionToNextPaintTargetSelector?: string
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

      // We compute scroll metrics at loading time to ensure we have scroll data when loading the view initially
      // This is to ensure that we have the depth data even if the user didn't scroll or if the view is not scrollable.
      const { scrollHeight, scrollDepth, scrollTop } = computeScrollValues()

      commonViewMetrics.scroll = {
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
      commonViewMetrics.scroll = newScrollMetrics
    },
    computeScrollValues
  )

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    commonViewMetrics.cumulativeLayoutShift = 0
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(
      configuration,
      lifeCycle,
      webVitalTelemetryDebug,
      (cumulativeLayoutShift, cumulativeLayoutShiftTargetSelector) => {
        commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
        commonViewMetrics.cumulativeLayoutShiftTargetSelector = cumulativeLayoutShiftTargetSelector
        scheduleViewUpdate()
      }
    ))
  } else {
    stopCLSTracking = noop
  }

  const { stop: stopINPTracking, getInteractionToNextPaint } = trackInteractionToNextPaint(
    configuration,
    loadingType,
    lifeCycle
  )

  return {
    stop: () => {
      stopLoadingTimeTracking()
      stopCLSTracking()
      stopScrollMetricsTracking()
      stopINPTracking()
    },
    setLoadEvent,
    getCommonViewMetrics: () => {
      const { interactionToNextPaint, interactionToNextPaintTargetSelector } = getInteractionToNextPaint() || {}
      commonViewMetrics.interactionToNextPaint = interactionToNextPaint
      commonViewMetrics.interactionToNextPaintTargetSelector = interactionToNextPaintTargetSelector
      return commonViewMetrics
    },
  }
}
