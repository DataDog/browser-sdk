import { RequestCompleteEvent } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { PageActivityEvent, trackPageActivities } from '../src/trackPageActivities'

function eventsCollector<T>() {
  const events: T[] = []
  beforeEach(() => {
    events.length = 0
  })
  return {
    events,
    pushEvent(event: T) {
      events.push(event)
    },
  }
}

describe('trackPagePageActivities', () => {
  const { events, pushEvent } = eventsCollector<PageActivityEvent>()
  it('emits an activity event on dom mutation', () => {
    const lifeCycle = new LifeCycle()
    trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('emits an activity event on resource collected', () => {
    const lifeCycle = new LifeCycle()
    trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
    const performanceEntry = {
      entryType: 'resource',
    }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceEntry as PerformanceEntry)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    const lifeCycle = new LifeCycle()
    trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
    const performanceEntry = {
      entryType: 'navigation',
    }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceEntry as PerformanceEntry)
    expect(events).toEqual([])
  })

  it('stops emiting activities after calling stop()', () => {
    const lifeCycle = new LifeCycle()
    const { stop, observable } = trackPageActivities(lifeCycle)
    observable.subscribe(pushEvent)

    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    expect(events).toEqual([{ isBusy: false }])

    stop()

    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    expect(events).toEqual([{ isBusy: false }])
  })

  describe('requests', () => {
    function makeFakeRequestCompleteEvent(requestId: number): RequestCompleteEvent {
      return { requestId } as any
    }
    it('emits an activity event when a request starts', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestId: 10,
      })
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestId: 10,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: false }])
    })

    it('ignores requests that has started before', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([])
    })

    it('keeps emiting busy events while all requests are not completed', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestId: 10,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestId: 11,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(9))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: true }, { isBusy: true }, { isBusy: false }])
    })
  })
})
