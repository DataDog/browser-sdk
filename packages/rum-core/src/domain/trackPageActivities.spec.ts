import { noop, Observable } from '@datadog/browser-core'
import { RumPerformanceNavigationTiming, RumPerformanceResourceTiming } from '../browser/performanceCollection'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RequestCompleteEvent } from './requestCollection'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
  PageActivityEvent,
  trackPageActivities,
  waitPageActivitiesCompletion,
} from './trackPageActivities'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time before the (potential) end of an action
const BEFORE_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 0.8
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = PAGE_ACTIVITY_MAX_DURATION * 10

function mockClock() {
  beforeEach(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate()
    spyOn(performance, 'now').and.callFake(() => Date.now())
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  return {
    tick(ms: number) {
      jasmine.clock().tick(ms)
    },
    expire() {
      // Make sure no action is still pending
      jasmine.clock().tick(EXPIRE_DELAY)
    },
  }
}

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
    const performanceTiming = {
      entryType: 'resource',
    }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceTiming as RumPerformanceResourceTiming)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    const lifeCycle = new LifeCycle()
    trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
    const performanceTiming = {
      entryType: 'navigation',
    }
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      performanceTiming as RumPerformanceNavigationTiming
    )
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
    function makeFakeRequestCompleteEvent(requestIndex: number): RequestCompleteEvent {
      return { requestIndex } as any
    }
    it('emits an activity event when a request starts', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: 10,
      })
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: 10,
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
        requestIndex: 10,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: 11,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(9))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: true }, { isBusy: true }, { isBusy: false }])
    })
  })
})

describe('waitPageActivitiesCompletion', () => {
  const clock = mockClock()

  it('should not collect an event that is not followed by page activity', (done) => {
    waitPageActivitiesCompletion(new Observable(), noop, (hadActivity, endTime) => {
      expect(hadActivity).toBeFalse()
      expect(endTime).toBeFalsy()
      done()
    })

    clock.expire()
  })

  it('should collect an event that is followed by page activity', (done) => {
    const activityObservable = new Observable<PageActivityEvent>()

    const startTime = performance.now()
    waitPageActivitiesCompletion(activityObservable, noop, (hadActivity, endTime) => {
      expect(hadActivity).toBeTrue()
      expect(endTime).toEqual(startTime + BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      done()
    })

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.expire()
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()

      // Extend the action but stops before PAGE_ACTIVITY_MAX_DURATION
      const extendCount = Math.floor(PAGE_ACTIVITY_MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY - 1)

      waitPageActivitiesCompletion(activityObservable, noop, (hadActivity, endTime) => {
        expect(hadActivity).toBeTrue()
        expect(endTime).toBe(startTime + (extendCount + 1) * BEFORE_PAGE_ACTIVITY_END_DELAY)
        done()
      })

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.expire()
    })

    it('expires after a limit', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false
      const startTime = performance.now()

      // Extend the action until it's more than PAGE_ACTIVITY_MAX_DURATION
      const extendCount = Math.ceil(PAGE_ACTIVITY_MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY + 1)

      waitPageActivitiesCompletion(activityObservable, noop, (hadActivity, endTime) => {
        expect(hadActivity).toBeTrue()
        expect(endTime).toBe(startTime + PAGE_ACTIVITY_MAX_DURATION)
        stop = true
        done()
      })

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.expire()
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()
      waitPageActivitiesCompletion(activityObservable, noop, (hadActivity, endTime) => {
        expect(hadActivity).toBeTrue()
        expect(endTime).toBe(startTime + BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + PAGE_ACTIVITY_END_DELAY * 2)
        done()
      })

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(PAGE_ACTIVITY_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.expire()
    })

    it('expires is the page is busy for too long', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()
      waitPageActivitiesCompletion(activityObservable, noop, (hadActivity, endTime) => {
        expect(hadActivity).toBeTrue()
        expect(endTime).toBe(startTime + PAGE_ACTIVITY_MAX_DURATION)
        done()
      })

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.expire()
    })
  })
})
