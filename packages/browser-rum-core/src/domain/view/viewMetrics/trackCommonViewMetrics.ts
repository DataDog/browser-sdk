import type { ClocksState, Duration } from '@datadog/js-core/time'
import type { Observable } from '@datadog/js-core/util'
import type { MutationRecord } from '@datadog/js-core/dom'
import type { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'
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
  domMutationObservable: Observable<MutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  scheduleViewUpdate: () => void,
  loadingType: ViewLoadingType,
  viewStart: ClocksState,
  isSoftNavigationTracked: boolean
) {
  const commonViewMetrics: CommonViewMetrics = {}
  let isLoadingTimeCanceled = false

  const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    loadingType,
    viewStart,
    (newLoadingTime) => {
      if (!isLoadingTimeCanceled) {
        commonViewMetrics.loadingTime = newLoadingTime
        scheduleViewUpdate()
      }
    }
  )
  const { stop: stopScrollMetricsTracking } = trackScrollMetrics(viewStart, (newScrollMetrics) => {
    commonViewMetrics.scroll = newScrollMetrics
  })
  const { stop: stopCLSTracking, setNavigationId: setCLSNavigationId } = trackCumulativeLayoutShift(
    configuration,
    viewStart.relative,
    (cumulativeLayoutShift) => {
      commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
      scheduleViewUpdate()
    },
    isSoftNavigationTracked
  )
  const {
    stop: stopINPTracking,
    getInteractionToNextPaint,
    setViewEnd,
    setNavigationId: setINPNavigationId,
  } = trackInteractionToNextPaint(configuration, viewStart.relative, loadingType, isSoftNavigationTracked)

  return {
    stop: () => {
      stopLoadingTimeTracking()
      stopCLSTracking()
      stopScrollMetricsTracking()
    },
    cancelLoadingTimeTracking: () => {
      isLoadingTimeCanceled = true
      stopLoadingTimeTracking()
    },
    stopINPTracking,
    setLoadEvent,
    setViewEnd,
    setNavigationId: (navigationId: number) => {
      setCLSNavigationId(navigationId)
      setINPNavigationId(navigationId)
    },
    getCommonViewMetrics: () => {
      commonViewMetrics.interactionToNextPaint = getInteractionToNextPaint()
      return commonViewMetrics
    },
  }
}
