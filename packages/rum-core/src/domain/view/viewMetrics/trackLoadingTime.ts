import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { elapsed } from '@datadog/browser-core'
import { waitPageActivityEnd } from '../../waitPageActivityEnd'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumMutationRecord } from '../../../browser/domMutationObservable'
import { trackFirstHidden } from './trackFirstHidden'

/**
 * For non-initial views (such as route changes or BFCache restores), the regular load event does not fire
 * In these cases, trackLoadingTime can only emit a loadingTime  if waitPageActivityEnd detects some post-restore activity.
 * If nothing happens after the view starts,no candidate is recorded and loadingTime stays undefined.
 */

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
  const firstHidden = trackFirstHidden(configuration, viewStart, window)

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      const loadingTime = Math.max(...loadingTimeCandidates)
      // firstHidden is a relative time from time origin, so we use the relative start time of the view to compare with the loading time
      if (loadingTime < firstHidden.timeStamp - viewStart.relative) {
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
