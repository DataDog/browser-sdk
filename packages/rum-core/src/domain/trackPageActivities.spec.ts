import { noop, Observable, TimeStamp, timeStampNow } from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'
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

function eventsCollector<T>() {
  const events: T[] = []
  beforeEach(() => {
    events.length = 0
  })
  return {
    events,
    pushEvent: (event: T) => {
      events.push(event)
    },
  }
}

describe('trackPagePageActivities', () => {
  const { events, pushEvent } = eventsCollector<PageActivityEvent>()

  let lifeCycle: LifeCycle
  let domMutationObservable: Observable<void>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    domMutationObservable = new Observable()
  })

  it('emits an activity event on dom mutation', () => {
    trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
    domMutationObservable.notify()
    expect(events).toEqual([{ isBusy: false }])
  })

  it('emits an activity event on resource collected', () => {
    trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
    const performanceTiming = {
      entryType: 'resource',
    }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceTiming as RumPerformanceResourceTiming)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
    const performanceTiming = {
      entryType: 'navigation',
    }
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      performanceTiming as RumPerformanceNavigationTiming
    )
    expect(events).toEqual([])
  })

  it('stops emitting activities after calling stop()', () => {
    const { stop, observable } = trackPageActivities(lifeCycle, domMutationObservable)
    observable.subscribe(pushEvent)

    domMutationObservable.notify()
    expect(events).toEqual([{ isBusy: false }])

    stop()

    domMutationObservable.notify()
    domMutationObservable.notify()

    expect(events).toEqual([{ isBusy: false }])
  })

  describe('requests', () => {
    function makeFakeRequestCompleteEvent(requestIndex: number) {
      return { requestIndex } as RequestCompleteEvent
    }
    let lifeCycle: LifeCycle
    let domMutationObservable: Observable<void>

    beforeEach(() => {
      lifeCycle = new LifeCycle()
      domMutationObservable = new Observable()
    })

    it('emits an activity event when a request starts', () => {
      trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: 10,
      })
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestIndex: 10,
      })
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: false }])
    })

    it('ignores requests that has started before', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([])
    })

    it('keeps emitting busy events while all requests are not completed', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle, domMutationObservable).observable.subscribe(pushEvent)
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
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('should not collect an event that is not followed by page activity', (done) => {
    waitPageActivitiesCompletion(new Observable(), noop, (params) => {
      expect(params.hadActivity).toBeFalse()
      expect((params as any).endTime).toBeUndefined()
      done()
    })

    clock.tick(EXPIRE_DELAY)
  })

  it('should collect an event that is followed by page activity', (done) => {
    const activityObservable = new Observable<PageActivityEvent>()

    const startTime = timeStampNow()
    waitPageActivitiesCompletion(activityObservable, noop, (params) => {
      expect(params.hadActivity).toBeTrue()
      expect((params as { hadActivity: true; endTime: TimeStamp }).endTime).toEqual(
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        (startTime + BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY) as TimeStamp
      )
      done()
    })

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.tick(EXPIRE_DELAY)
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()

      // Extend the action but stops before PAGE_ACTIVITY_MAX_DURATION
      const extendCount = Math.floor(PAGE_ACTIVITY_MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY - 1)

      waitPageActivitiesCompletion(activityObservable, noop, (params) => {
        expect(params.hadActivity).toBeTrue()
        expect((params as { hadActivity: true; endTime: TimeStamp }).endTime).toBe(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          (startTime + (extendCount + 1) * BEFORE_PAGE_ACTIVITY_END_DELAY) as TimeStamp
        )
        done()
      })

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)
    })

    it('expires after a limit', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false
      const startTime = timeStampNow()

      // Extend the action until it's more than PAGE_ACTIVITY_MAX_DURATION
      const extendCount = Math.ceil(PAGE_ACTIVITY_MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY + 1)

      waitPageActivitiesCompletion(activityObservable, noop, (params) => {
        expect(params.hadActivity).toBeTrue()
        expect((params as { hadActivity: true; endTime: TimeStamp }).endTime).toBe(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          (startTime + PAGE_ACTIVITY_MAX_DURATION) as TimeStamp
        )
        stop = true
        done()
      })

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()
      waitPageActivitiesCompletion(activityObservable, noop, (params) => {
        expect(params.hadActivity).toBeTrue()
        expect((params as { hadActivity: true; endTime: TimeStamp }).endTime).toBe(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          (startTime + BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + PAGE_ACTIVITY_END_DELAY * 2) as TimeStamp
        )
        done()
      })

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(PAGE_ACTIVITY_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.tick(EXPIRE_DELAY)
    })

    it('expires is the page is busy for too long', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()
      waitPageActivitiesCompletion(activityObservable, noop, (params) => {
        expect(params.hadActivity).toBeTrue()
        expect((params as { hadActivity: true; endTime: TimeStamp }).endTime).toBe(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          (startTime + PAGE_ACTIVITY_MAX_DURATION) as TimeStamp
        )
        done()
      })

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(EXPIRE_DELAY)
    })
  })
})
