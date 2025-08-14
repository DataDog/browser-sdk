import type { RelativeTime } from '@datadog/browser-core'
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

  function createRequestCompleteEvent({
    startTime,
    url = URL,
  }: {
    startTime: number
    url?: string
  }): RequestCompleteEvent {
    return {
      startClocks: { relative: startTime as RelativeTime },
      url,
    } as RequestCompleteEvent
  }

  function createResourceEntry({ startTime }: { startTime: number }) {
    return createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: startTime as RelativeTime,
      name: URL,
    })
  }
})
