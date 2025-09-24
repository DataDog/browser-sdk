import { addTelemetryDebug } from '@datadog/browser-core'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'

export interface RequestRegistry {
  getMatchingRequest(entry: RumPerformanceResourceTiming): RequestCompleteEvent | undefined
  stop(): void
}

// Maximum number of requests to keep in the registry. Requests should be removed quite quickly in
// general, this is just a safety limit to avoid memory leaks in case of a bug.
export const MAX_REQUESTS = 1000

export function createRequestRegistry(lifeCycle: LifeCycle): RequestRegistry {
  const requests = new Set<RequestCompleteEvent>()

  const subscription = lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
    requests.add(request)
    if (requests.size > MAX_REQUESTS) {
      // monitor-until: 2026-01-01, after early request collection GA
      addTelemetryDebug('Too many requests')
      requests.delete(requests.values().next().value!)
    }
  })

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
