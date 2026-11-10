import type { ClocksState, RelativeTime, Duration, TimeStamp } from '@datadog/js-core/time'
import type { Observable } from '@datadog/js-core/util'
import type { MutationRecord } from '@datadog/js-core/dom'
import { elapsed, timeStampNow } from '@datadog/js-core/time'
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
  let hasManualLoadingTime = false
  let viewEnded = false
  let scrollMetricsTracking: ReturnType<typeof trackScrollMetrics> | undefined
  let clsTracking: ReturnType<typeof trackCumulativeLayoutShift> | undefined
  let inpTracking: ReturnType<typeof trackInteractionToNextPaint> | undefined

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

  // Automatic view metrics can be disabled (e.g. in a Web Worker), manual loading time is always kept
  if (configuration.trackAutomaticViewMetrics) {
    scrollMetricsTracking = trackScrollMetrics(viewStart, (newScrollMetrics) => {
      commonViewMetrics.scroll = newScrollMetrics
    })
    clsTracking = trackCumulativeLayoutShift(
      configuration,
      viewStart.relative,
      (cumulativeLayoutShift) => {
        commonViewMetrics.cumulativeLayoutShift = cumulativeLayoutShift
        scheduleViewUpdate()
      },
      isSoftNavigationTracked
    )
    inpTracking = trackInteractionToNextPaint(configuration, viewStart.relative, loadingType, isSoftNavigationTracked)
  }

  return {
    stop: () => {
      stopLoadingTimeTracking()
      clsTracking?.stop()
      scrollMetricsTracking?.stop()
    },
    stopINPTracking: () => inpTracking?.stop(),
    setLoadEvent,
    setViewEnd: (viewEndTime: RelativeTime) => {
      viewEnded = true
      inpTracking?.setViewEnd(viewEndTime)
    },
    setNavigationId: (navigationId: number) => {
      clsTracking?.setNavigationId(navigationId)
      inpTracking?.setNavigationId(navigationId)
    },
    getCommonViewMetrics: () => {
      commonViewMetrics.interactionToNextPaint = inpTracking?.getInteractionToNextPaint()
      return commonViewMetrics
    },
    setLoadingTime: (callTimestamp?: TimeStamp) => {
      if (viewEnded) {
        return
      }
      const loadingTime = elapsed(viewStart.timeStamp, callTimestamp ?? timeStampNow())
      if (!hasManualLoadingTime) {
        stopLoadingTimeTracking()
      }
      hasManualLoadingTime = true
      commonViewMetrics.loadingTime = loadingTime
      scheduleViewUpdate()
    },
  }
}
