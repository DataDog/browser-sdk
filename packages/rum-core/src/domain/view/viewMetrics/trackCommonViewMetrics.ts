import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { isLayoutShiftSupported, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'
import type { InteractionToNextPaint } from './trackInteractionToNextPaint'
import { trackInteractionToNextPaint } from './trackInteractionToNextPaint'
import { trackLoadingTime } from './trackLoadingTime'
import type { ScrollMetrics } from './trackScrollMetrics'
import { trackScrollMetrics } from './trackScrollMetrics'

export interface CommonViewMetrics {
  loadingTime?: Duration
  cumulativeLayoutShift?: CumulativeLayoutShift
  interactionToNextPaint?: InteractionToNextPaint
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

  const { stop: stopScrollMetricsTracking } = trackScrollMetrics(configuration, viewStart, (newScrollMetrics) => {
    commonViewMetrics.scroll = newScrollMetrics
  })

  let stopCLSTracking: () => void
  if (isLayoutShiftSupported()) {
    commonViewMetrics.cumulativeLayoutShift = { value: 0 }
    ;({ stop: stopCLSTracking } = trackCumulativeLayoutShift(
      configuration,
      lifeCycle,
      webVitalTelemetryDebug,
      (cumulativeLayoutShift) => {
        commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
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
      commonViewMetrics.interactionToNextPaint = getInteractionToNextPaint()
      return commonViewMetrics
    },
  }
}
