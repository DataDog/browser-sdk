import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { elapsed } from '@datadog/browser-core'
import { waitPageActivityEnd } from '../../waitPageActivityEnd'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumMutationRecord } from '../../../browser/domMutationObservable'
import { trackFirstHidden } from './trackFirstHidden'

export function trackLoadingTime(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  loadType: ViewLoadingType,
  viewStart: ClocksState,
  callback: (loadingTime: Duration) => void
) {
  let isWaitingForLoadEvent = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: Duration[] = []
  const firstHidden = trackFirstHidden(configuration, window, { initialView: isWaitingForLoadEvent })

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      const loadingTime = Math.max(...loadingTimeCandidates)
      // Beware, Date.now() at time origin could differ from performance.timeOrigin by a few ms
      // @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin
      const viewStartRelativeTime = viewStart.timeStamp - performance.timeOrigin
      const isVisibleDuringLoading = loadingTime < firstHidden.timeStamp - viewStartRelativeTime

      if (isVisibleDuringLoading) {
        callback(loadingTime as Duration)
      }
    }
  }

  const { stop } = waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    (event) => {
      if (isWaitingForActivityLoadingTime) {
        isWaitingForActivityLoadingTime = false
        if (event.hadActivity) {
          loadingTimeCandidates.push(elapsed(viewStart.timeStamp, event.end))
        }
        invokeCallbackIfAllCandidatesAreReceived()
      }
    }
  )

  return {
    stop: () => {
      stop()
      firstHidden.stop()
    },
    setLoadEvent: (loadEvent: Duration) => {
      if (isWaitingForLoadEvent) {
        isWaitingForLoadEvent = false
        loadingTimeCandidates.push(loadEvent)
        invokeCallbackIfAllCandidatesAreReceived()
      }
    },
  }
}
