import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { addExperimentalFeatures, ExperimentalFeature, RequestType } from '@datadog/browser-core'
import type { Clock, MockTelemetry } from '@datadog/browser-core/test'
import { mockClock, startMockTelemetry } from '@datadog/browser-core/test'
import { createPerformanceEntry } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RequestCompleteEvent } from '../requestCollection'
import { createRequestRegistry, MAX_REQUESTS } from './requestRegistry'

describe('RequestRegistry', () => {
  const URL = 'https://example.com/resource'
  it('returns the closest preceding request', () => {
    const lifeCycle = new LifeCycle()

    const requestRegistry = createRequestRegistry(lifeCycle)
    const request1 = createRequestCompleteEvent({ startTime: 1 })
    const request2 = createRequestCompleteEvent({ startTime: 2 })
    const request3 = createRequestCompleteEvent({ startTime: 3 })
    const request4 = createRequestCompleteEvent({ startTime: 100 })
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request1)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request2)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request3)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request4)

    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 99 }))).toBe(request3)
  })

  it('ignores requests that have a different URL', () => {
    const lifeCycle = new LifeCycle()

    const requestRegistry = createRequestRegistry(lifeCycle)

    const request1 = createRequestCompleteEvent({ startTime: 1, url: URL })
    const request2 = createRequestCompleteEvent({ startTime: 2, url: 'https://another-url.com/resource' })
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request1)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request2)

    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 3 }))).toBe(request1)
  })

  it('does not return the same request twice', () => {
    const lifeCycle = new LifeCycle()

    const requestRegistry = createRequestRegistry(lifeCycle)

    const request1 = createRequestCompleteEvent({ startTime: 1 })
    const request2 = createRequestCompleteEvent({ startTime: 2 })

    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request1)
    lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, request2)

    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 2 }))).toBe(request2)
    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 2 }))).toBe(request1)
    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 2 }))).toBeUndefined()
  })

  it('is limited to a maximum number of requests', () => {
    const lifeCycle = new LifeCycle()
    const requestRegistry = createRequestRegistry(lifeCycle)
    for (let i = 0; i < MAX_REQUESTS + 1; i++) {
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createRequestCompleteEvent({ startTime: i }))
    }
    expect(requestRegistry.getMatchingRequest(createResourceEntry({ startTime: 0 }))).toBeUndefined()
  })

  describe('when the registry overflows', () => {
    let telemetry: MockTelemetry
    let lifeCycle: LifeCycle

    beforeEach(() => {
      telemetry = startMockTelemetry()
      lifeCycle = new LifeCycle()
      createRequestRegistry(lifeCycle)
    })

    it('fires "Too many requests" telemetry only once', async () => {
      for (let i = 0; i < MAX_REQUESTS + 3; i++) {
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createRequestCompleteEvent({ startTime: i }))
      }
      expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining({ message: 'Too many requests' })])
    })

    it('includes debug context when TOO_MANY_REQUESTS_INVESTIGATION is enabled', async () => {
      const clock: Clock = mockClock()
      addExperimentalFeatures([ExperimentalFeature.TOO_MANY_REQUESTS_INVESTIGATION])
      let fetchCount = 0
      let xhrCount = 0
      let abortedCount = 0
      let abortedOnStartCount = 0

      // oldest request: created at t=0, FETCH, takes 50ms
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createRequestCompleteEvent({ startTime: 0, timeStamp: clock.timeStamp(0), duration: 50 as Duration })
      )
      fetchCount++

      clock.tick(1000)

      // 1 XHR request
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createRequestCompleteEvent({ startTime: MAX_REQUESTS - 1, type: RequestType.XHR })
      )
      xhrCount++

      // aborted
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createRequestCompleteEvent({ startTime: MAX_REQUESTS, isAborted: true })
      )
      fetchCount++
      abortedCount++

      // aborted on start
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createRequestCompleteEvent({ startTime: MAX_REQUESTS, isAborted: true, isAbortedOnStart: true })
      )
      fetchCount++
      abortedCount++
      abortedOnStartCount++

      // trigger requests until we reach the limit
      while (fetchCount + xhrCount <= MAX_REQUESTS) {
        lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createRequestCompleteEvent({ startTime: 10 }))
        fetchCount++
      }

      expect(await telemetry.getEvents()).toEqual([
        jasmine.objectContaining({
          message: 'Too many requests',
          abortedCount,
          abortedOnStartCount,
          xhrCount,
          fetchCount,
          oldestRequestAge: 1000,
          oldestRequestEndAge: 950,
          withoutMatchingEntryCount: MAX_REQUESTS + 1,
        }),
      ])
    })
  })

  function createRequestCompleteEvent({
    startTime,
    url = URL,
    timeStamp,
    duration = 0 as Duration,
    type = RequestType.FETCH,
    isAborted = false,
    isAbortedOnStart = false,
  }: {
    startTime: number
    url?: string
    timeStamp?: TimeStamp
    duration?: Duration
    type?: RequestType
    isAborted?: boolean
    isAbortedOnStart?: boolean
  }): RequestCompleteEvent {
    return {
      startClocks: { relative: startTime as RelativeTime, timeStamp },
      url,
      duration,
      type,
      isAborted,
      isAbortedOnStart,
    } as RequestCompleteEvent
  }

  function createResourceEntry({ startTime }: { startTime: number }) {
    return createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: startTime as RelativeTime,
      name: URL,
    })
  }
})
