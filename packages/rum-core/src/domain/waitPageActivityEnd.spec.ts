import type { RelativeTime, Subscription } from '@datadog/browser-core'
import { Observable, ONE_SECOND, getTimeStamp } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock } from '@datadog/browser-core/test/specHelper'
import type { TestSetupBuilder } from '../../test/specHelper'
import { setup } from '../../test/specHelper'
import type { RumPerformanceNavigationTiming, RumPerformanceResourceTiming } from '../browser/performanceCollection'
import { LifeCycleEventType } from './lifeCycle'
import type { RequestCompleteEvent, RequestStartEvent } from './requestCollection'
import type { PageActivityEvent, PageActivityEndEvent } from './waitPageActivityEnd'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_VALIDATION_DELAY,
  doWaitPageActivityEnd,
  createPageActivityObservable,
} from './waitPageActivityEnd'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time before the (potential) end of an action
const BEFORE_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 0.8
// Arbitrary maximum duration to be used to test page activities max duration
const MAX_DURATION = 10 * ONE_SECOND
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = MAX_DURATION * 10

const FAKE_URL = 'https://example.com'

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

describe('createPageActivityObservable', () => {
  const { events, pushEvent } = eventsCollector<PageActivityEvent>()

  let setupBuilder: TestSetupBuilder
  let pageActivitySubscription: Subscription

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, domMutationObservable, configuration }) => {
      const pageActivityObservable = createPageActivityObservable(lifeCycle, domMutationObservable, configuration)
      pageActivitySubscription = pageActivityObservable.subscribe(pushEvent)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('emits an activity event on dom mutation', () => {
    const { domMutationObservable } = setupBuilder.build()
    domMutationObservable.notify()
    expect(events).toEqual([{ isBusy: false }])
  })

  it('emits an activity event on resource collected', () => {
    const { lifeCycle } = setupBuilder.build()
    const performanceTiming = {
      entryType: 'resource',
    } as RumPerformanceResourceTiming
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceTiming])
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    const { lifeCycle } = setupBuilder.build()
    const performanceTiming = {
      entryType: 'navigation',
    } as RumPerformanceNavigationTiming
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [performanceTiming])
    expect(events).toEqual([])
  })

  it('stops emitting activities after calling stop()', () => {
    const { domMutationObservable } = setupBuilder.build()
    domMutationObservable.notify()
    expect(events).toEqual([{ isBusy: false }])

    pageActivitySubscription.unsubscribe()

    domMutationObservable.notify()
    domMutationObservable.notify()

    expect(events).toEqual([{ isBusy: false }])
  })

  describe('programmatic requests', () => {
    it('emits an activity event when a request starts', () => {
      const { lifeCycle } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      const { lifeCycle } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: false }])
    })

    it('ignores requests that has started before', () => {
      const { lifeCycle } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([])
    })

    it('keeps emitting busy events while all requests are not completed', () => {
      const { lifeCycle } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(10))
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, makeFakeRequestStartEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(9))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(11))
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, makeFakeRequestCompleteEvent(10))
      expect(events).toEqual([{ isBusy: true }, { isBusy: true }, { isBusy: true }, { isBusy: false }])
    })

    function makeFakeRequestCompleteEvent(requestIndex: number) {
      return { requestIndex, url: FAKE_URL } as RequestCompleteEvent
    }
    function makeFakeRequestStartEvent(requestIndex: number): RequestStartEvent {
      return { requestIndex, url: FAKE_URL }
    }
  })
})

describe('doWaitPageActivityEnd', () => {
  let clock: Clock
  let idlPageActivityCallbackSpy: jasmine.Spy<(event: PageActivityEndEvent) => void>

  beforeEach(() => {
    idlPageActivityCallbackSpy = jasmine.createSpy()
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('should notify the callback after `EXPIRE_DELAY` when there is no activity', () => {
    doWaitPageActivityEnd(new Observable(), idlPageActivityCallbackSpy)

    clock.tick(EXPIRE_DELAY)

    expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: false,
    })
  })

  it('should notify the callback with the last activity timestamp', () => {
    const activityObservable = new Observable<PageActivityEvent>()

    doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.tick(EXPIRE_DELAY)

    expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
      hadActivity: true,
      end: getTimeStamp(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY as RelativeTime),
    })
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      // Extend the action 10 times
      const extendCount = 10

      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: getTimeStamp((extendCount * BEFORE_PAGE_ACTIVITY_END_DELAY) as RelativeTime),
      })
    })

    it('expires after a maximum duration', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false

      // Extend the action until it's more than MAX_DURATION
      const extendCount = Math.ceil(MAX_DURATION / BEFORE_PAGE_ACTIVITY_END_DELAY + 1)

      idlPageActivityCallbackSpy.and.callFake(() => {
        stop = true
      })
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy, MAX_DURATION)

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_PAGE_ACTIVITY_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: getTimeStamp(MAX_DURATION as RelativeTime),
      })
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(PAGE_ACTIVITY_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: getTimeStamp((BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + PAGE_ACTIVITY_END_DELAY * 2) as RelativeTime),
      })
    })

    it('expires is the page is busy for too long', () => {
      const activityObservable = new Observable<PageActivityEvent>()
      doWaitPageActivityEnd(activityObservable, idlPageActivityCallbackSpy, MAX_DURATION)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(EXPIRE_DELAY)

      expect(idlPageActivityCallbackSpy).toHaveBeenCalledOnceWith({
        hadActivity: true,
        end: getTimeStamp(MAX_DURATION as RelativeTime),
      })
    })
  })
})
