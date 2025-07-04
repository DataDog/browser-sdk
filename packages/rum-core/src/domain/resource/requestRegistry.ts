import { setInterval, clearInterval, addTelemetryDebug, ONE_SECOND } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { LifeCycleEventType, type LifeCycle } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'

export interface RequestRegistry {
  getMatchingRequest(entry: RumPerformanceResourceTiming): RequestCompleteEvent | undefined
  stop(): void
}

export function createRequestRegistry(lifeCycle: LifeCycle): RequestRegistry {
  const requests = new Set<RequestCompleteEvent>()

  const subscription = lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => requests.add(request))

  const interval = setInterval(() => {
    if (requests.size > 200) {
      addTelemetryDebug('Too many requests', { requestsCount: requests.size })
      clearInterval(interval)
    }
  }, 30 * ONE_SECOND)

  return {
    getMatchingRequest(entry) {
      // Returns the closest request object that happened before the entry
      let minTimeDifference = Infinity
      let closestRequest: RequestCompleteEvent | undefined
      for (const request of requests) {
        const timeDifference = entry.startTime - request.startClocks.relative
        if (0 <= timeDifference && timeDifference < minTimeDifference && request.url === entry.name) {
          minTimeDifference = Math.abs(timeDifference)
          closestRequest = request
        }
      }

      if (closestRequest) {
        requests.delete(closestRequest)
      }

      return closestRequest
    },

    stop() {
      subscription.unsubscribe()
    },
  }
}
