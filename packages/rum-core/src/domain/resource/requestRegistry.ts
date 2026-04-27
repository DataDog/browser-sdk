import type { Context } from '@datadog/browser-core'
import {
  addTelemetryDebug,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  RequestType,
  timeStampNow,
} from '@datadog/browser-core'
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
  let tooManyRequestsReported = false

  const subscription = lifeCycle.subscribe(LifeCycleEventType.REQUEST_COMPLETED, (request) => {
    requests.add(request)

    if (requests.size > MAX_REQUESTS) {
      const oldestRequest = requests.values().next().value!

      if (!tooManyRequestsReported) {
        tooManyRequestsReported = true

        let debugContext: Context | undefined

        if (isExperimentalFeatureEnabled(ExperimentalFeature.TOO_MANY_REQUESTS_INVESTIGATION)) {
          let abortedCount = 0
          let abortedOnStartCount = 0
          let xhrCount = 0
          let withoutMatchingEntryCount = 0
          for (const r of requests) {
            if (r.isAborted) {
              abortedCount++
            }
            if (r.isAbortedOnStart) {
              abortedOnStartCount++
            }
            if (r.type === RequestType.XHR) {
              xhrCount++
            }
            const entries = performance.getEntriesByName(r.url, 'resource') as PerformanceResourceTiming[]
            const hasMatchingEntry = entries.some((e) => e.startTime >= r.startClocks.relative)
            if (!hasMatchingEntry) {
              withoutMatchingEntryCount++
            }
          }
          const oldestRequestAge = timeStampNow() - oldestRequest.startClocks.timeStamp
          debugContext = {
            abortedCount,
            abortedOnStartCount,
            xhrCount,
            fetchCount: requests.size - xhrCount,
            oldestRequestAge,
            oldestRequestEndAge: oldestRequestAge - oldestRequest.duration,
            withoutMatchingEntryCount,
          }
        }

        // monitor-until: 2026-06-01, after early request collection is the default in v7
        addTelemetryDebug('Too many requests', debugContext)
      }

      requests.delete(oldestRequest)
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
