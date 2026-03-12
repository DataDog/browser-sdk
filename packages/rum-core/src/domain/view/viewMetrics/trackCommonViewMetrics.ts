import type { ClocksState, Duration, Observable, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { elapsed, timeStampNow } from '@datadog/browser-core'
import type { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import type { RumMutationRecord } from '../../../browser/domMutationObservable'
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
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  scheduleViewUpdate: () => void,
  loadingType: ViewLoadingType,
  viewStart: ClocksState
) {
  const commonViewMetrics: CommonViewMetrics = {}
  let hasManualLoadingTime = false
  let viewEnded = false

  const { stop: stopLoadingTimeTracking, setLoadEvent } = trackLoadingTime(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    loadingType,
    viewStart,
    (newLoadingTime) => {
      if (!hasManualLoadingTime) {
        commonViewMetrics.loadingTime = newLoadingTime
        scheduleViewUpdate()
      }
    }
  )

  const { stop: stopScrollMetricsTracking } = trackScrollMetrics(configuration, viewStart, (newScrollMetrics) => {
    commonViewMetrics.scroll = newScrollMetrics
  })

  const { stop: stopCLSTracking } = trackCumulativeLayoutShift(
    configuration,
    viewStart.relative,
    (cumulativeLayoutShift) => {
      commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
      scheduleViewUpdate()
    }
  )

  const {
    stop: stopINPTracking,
    getInteractionToNextPaint,
    setViewEnd: setINPViewEnd,
  } = trackInteractionToNextPaint(configuration, viewStart.relative, loadingType)

  return {
    stop: () => {
      stopLoadingTimeTracking()
      stopCLSTracking()
      stopScrollMetricsTracking()
    },
    stopINPTracking,
    setLoadEvent,
    setViewEnd: (viewEndTime: RelativeTime) => {
      viewEnded = true
      setINPViewEnd(viewEndTime)
    },
    getCommonViewMetrics: () => {
      commonViewMetrics.interactionToNextPaint = getInteractionToNextPaint()
      return commonViewMetrics
    },
    setLoadingTime: (callTimestamp?: TimeStamp) => {
      if (viewEnded) {
        return { no_active_view: true, overwritten: hasManualLoadingTime }
      }
      const loadingTime = elapsed(viewStart.timeStamp, callTimestamp ?? timeStampNow())
      if (!hasManualLoadingTime) {
        stopLoadingTimeTracking()
      }
      const overwritten = hasManualLoadingTime
      hasManualLoadingTime = true
      commonViewMetrics.loadingTime = loadingTime
      scheduleViewUpdate()
      return { no_active_view: false, overwritten }
    },
  }
}
