import type { ClocksState, Duration, Observable } from '@datadog/browser-core'
import { elapsed } from '@datadog/browser-core'
import { waitPageActivityEnd } from '../../waitPageActivityEnd'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { trackFirstHidden } from './trackFirstHidden'

export function trackLoadingTime(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration,
  loadType: ViewLoadingType,
  viewStart: ClocksState,
  callback: (loadingTime: Duration, wasHiddenDuringLoading: boolean) => void
) {
  let isWaitingForLoadEvent = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: Duration[] = []
  const firstHidden = trackFirstHidden(configuration)

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (!isWaitingForActivityLoadingTime && !isWaitingForLoadEvent && loadingTimeCandidates.length > 0) {
      const loadingTime = Math.max(...loadingTimeCandidates)
      callback(loadingTime as Duration, loadingTime < firstHidden.timeStamp)
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
