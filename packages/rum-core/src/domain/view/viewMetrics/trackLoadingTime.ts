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
  configuration: RumConfiguration,
  loadType: ViewLoadingType,
  viewStart: ClocksState,
  callback: (loadingTime: Duration) => void
) {
  let isWaitingForLoadEvent = loadType === ViewLoadingType.INITIAL_LOAD
  let isWaitingForActivityLoadingTime = true
  const loadingTimeCandidates: Duration[] = []
  const firstHidden = trackFirstHidden(configuration)

  function invokeCallbackIfAllCandidatesAreReceived() {
    if (
      firstHidden.timeStamp !== 0 &&
      !isWaitingForActivityLoadingTime &&
      !isWaitingForLoadEvent &&
      loadingTimeCandidates.length > 0
    ) {
      callback(Math.max(...loadingTimeCandidates) as Duration)
    }
  }

  const { stop } = waitPageActivityEnd(lifeCycle, domMutationObservable, configuration, (event) => {
    if (isWaitingForActivityLoadingTime) {
      isWaitingForActivityLoadingTime = false
      if (event.hadActivity) {
        loadingTimeCandidates.push(elapsed(viewStart.timeStamp, event.end))
      }
      invokeCallbackIfAllCandidatesAreReceived()
    }
  })

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
