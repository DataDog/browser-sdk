import { noop, Observable, ONE_SECOND, TimeStamp, timeStampNow } from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'
import { RumPerformanceNavigationTiming, RumPerformanceResourceTiming } from '../browser/performanceCollection'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RequestCompleteEvent } from './requestCollection'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_VALIDATION_DELAY,
  PageActivityEvent,
  trackPageActivities,
  waitPageActivitiesCompletion,
  CompletionCallbackParameters,
} from './trackPageActivities'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time before the (potential) end of an action
const BEFORE_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 0.8
// Arbitrary maximum duration to be used to test page activities max duration
const MAX_DURATION = 10 * ONE_SECOND
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = MAX_DURATION * 10

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
  let completionCallbackSpy: jasmine.Spy<(params: CompletionCallbackParameters) => void>

  beforeEach(() => {
    completionCallbackSpy = jasmine.createSpy()
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('should not collect an event that is not followed by page activity', () => {
    waitPageActivitiesCompletion(new Observable(), noop, completionCallbackSpy)

    clock.tick(EXPIRE_DELAY)

    expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: false,
    })
  })

  it('should collect an event that is followed by page activity', () => {
    const activityObservable = new Observable<PageActivityEvent>()

    const startTime = timeStampNow()
    waitPageActivitiesCompletion(activityObservable, noop, completionCallbackSpy)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.tick(EXPIRE_DELAY)

    expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: true,
      endClocks: {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        timeStamp: (startTime + BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY) as TimeStamp,
        relative: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY,
      },
    })
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()
      // Extend the action 10 times
      const extendCount = 10

      waitPageActivitiesCompletion(activityObservable, noop, completionCallbackSpy)

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      const relative = extendCount * BEFORE_PAGE_ACTIVITY_END_DELAY
      expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        endClocks: {
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          timeStamp: (startTime + relative) as TimeStamp,
          relative,
        },
      })
    })

    it('expires after a maximum duration', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false
      const startTime = timeStampNow()

      // Extend the action until it's more than MAX_DURATION
      const extendCount = Math.ceil(MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY + 1)

      completionCallbackSpy.and.callFake(() => {
        stop = true
      })
      waitPageActivitiesCompletion(activityObservable, noop, completionCallbackSpy, MAX_DURATION)

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        endClocks: {
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          timeStamp: (startTime + MAX_DURATION) as TimeStamp,
          relative: MAX_DURATION,
        },
      })
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()
      waitPageActivitiesCompletion(activityObservable, noop, completionCallbackSpy)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(PAGE_ACTIVITY_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.tick(EXPIRE_DELAY)

      const relative = BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + PAGE_ACTIVITY_END_DELAY * 2
      expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        endClocks: {
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          timeStamp: (startTime + relative) as TimeStamp,
          relative,
        },
      })
    })

    it('expires is the page is busy for too long', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = timeStampNow()
      waitPageActivitiesCompletion(activityObservable, noop, completionCallbackSpy, MAX_DURATION)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(EXPIRE_DELAY)

      expect(completionCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        endClocks: {
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          timeStamp: (startTime + MAX_DURATION) as TimeStamp,
          relative: MAX_DURATION,
        },
      })
    })
  })
})
