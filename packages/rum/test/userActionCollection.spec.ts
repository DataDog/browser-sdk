import {
  DOM_EVENT,
  ErrorMessage,
  getHash,
  getPathName,
  getSearch,
  Observable,
  RequestCompleteEvent,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import {
  $$tests,
  AutoUserAction,
  getUserActionReference,
  PageActivityEvent,
  startUserActionCollection,
  USER_ACTION_END_DELAY,
  USER_ACTION_MAX_DURATION,
  USER_ACTION_VALIDATION_DELAY,
  UserAction,
  UserActionType,
} from '../src/userActionCollection'
const { waitUserActionCompletion, trackPageActivities, resetUserAction, newUserAction } = $$tests
import { View, ViewLoadType } from '../src/viewCollection'

// Used to wait some time after the creation of a user action
const BEFORE_USER_ACTION_VALIDATION_DELAY = USER_ACTION_VALIDATION_DELAY * 0.8
// Used to wait some time before the (potential) end of a user action
const BEFORE_USER_ACTION_END_DELAY = USER_ACTION_END_DELAY * 0.8
// Used to wait some time after the (potential) end of a user action
const AFTER_USER_ACTION_END_DELAY = USER_ACTION_END_DELAY * 1.2
// Used to wait some time but it doesn't matter how much.
const SOME_ARBITRARY_DELAY = 50
// A long delay used to wait after any user action is finished.
const EXPIRE_DELAY = USER_ACTION_MAX_DURATION * 10

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
      // Make sure no user action is still pending
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

describe('startUserActionCollection', () => {
  const { events, pushEvent } = eventsCollector()
  const clock = mockClock()
  let button: HTMLButtonElement
  let userActionCollectionSubscription: { stop(): void }
  let lifeCycle: LifeCycle

  beforeEach(() => {
    button = document.createElement('button')
    button.type = 'button'
    button.appendChild(document.createTextNode('Click me'))
    document.body.appendChild(button)

    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, pushEvent)
    userActionCollectionSubscription = startUserActionCollection(lifeCycle)
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    userActionCollectionSubscription.stop()
  })

  function mockValidatedClickUserAction() {
    button.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
      // Since we don't collect dom mutations for this test, manually dispatch one
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()

    clock.expire()
  }

  it('cancels user action on view loading', () => {
    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    const mockView: Partial<View> = {
      documentVersion: 0,
      id: 'foo',
      location: fakeLocation as Location,
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_COLLECTED, mockView as View)

    mockValidatedClickUserAction()

    expect(events).toEqual([])
  })

  it('starts a user action when clicking on an element after a view loading', () => {
    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    const mockView: Partial<View> = {
      documentVersion: 0,
      id: 'foo',
      location: fakeLocation as Location,
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_COLLECTED, mockView as View)

    // View loads are completed like a UA would have been completed when there is no activity for a given time
    clock.tick(AFTER_USER_ACTION_END_DELAY)

    mockValidatedClickUserAction()
    expect(events).toEqual([
      {
        duration: BEFORE_USER_ACTION_VALIDATION_DELAY,
        id: jasmine.any(String),
        measures: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        name: 'Click me',
        startTime: jasmine.any(Number),
        type: UserActionType.CLICK,
      },
    ])
  })

  it('starts a user action when clicking on an element', () => {
    mockValidatedClickUserAction()
    expect(events).toEqual([
      {
        duration: BEFORE_USER_ACTION_VALIDATION_DELAY,
        id: jasmine.any(String),
        measures: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        name: 'Click me',
        startTime: jasmine.any(Number),
        type: UserActionType.CLICK,
      },
    ])
  })

  it('cancels a user action when if nothing happens after a click', () => {
    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()

    clock.expire()
    expect(events).toEqual([])
  })
})

describe('getUserActionReference', () => {
  const clock = mockClock()
  const { events, pushEvent } = eventsCollector<UserAction>()

  beforeEach(() => {
    resetUserAction()
  })

  it('returns the current user action reference', () => {
    expect(getUserActionReference()).toBeUndefined()
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test')

    const userActionReference = getUserActionReference(Date.now())!

    expect(userActionReference).toBeDefined()

    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    expect(getUserActionReference()).toBeDefined()

    clock.expire()

    expect(getUserActionReference()).toBeUndefined()

    const userAction = events[0] as AutoUserAction
    expect(userAction.id).toBe(userActionReference.id)
  })

  it('do not return the user action reference for events occuring before the start of the user action', () => {
    const timeBeforeStartingUserAction = Date.now()

    clock.tick(SOME_ARBITRARY_DELAY)
    newUserAction(new LifeCycle(), UserActionType.CLICK, 'test')

    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY * 0.5)
    const timeAfterStartingUserAction = Date.now()
    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY * 0.5)

    expect(getUserActionReference()).toBeDefined()
    expect(getUserActionReference(timeAfterStartingUserAction)).toBeDefined()
    expect(getUserActionReference(timeBeforeStartingUserAction)).toBeUndefined()

    clock.expire()
  })
})

describe('newUserAction', () => {
  const clock = mockClock()
  const { events, pushEvent } = eventsCollector<UserAction>()

  it('cancels any starting user action while another one is happening', () => {
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test-1')
    newUserAction(lifeCycle, UserActionType.CLICK, 'test-2')

    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    clock.expire()
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  it('counts errors occuring during the user action', () => {
    const error = {}
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test-1')

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)
    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)

    clock.expire()
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)

    expect(events.length).toBe(1)
    const userAction = events[0] as AutoUserAction
    expect(userAction.measures).toEqual({
      errorCount: 2,
      longTaskCount: 0,
      resourceCount: 0,
    })
  })
})

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

describe('waitUserActionCompletion', () => {
  const clock = mockClock()

  it('should not collect an event that is not followed by page activity', (done) => {
    waitUserActionCompletion(new Observable(), (endTime) => {
      expect(endTime).toBeUndefined()
      done()
    })

    clock.expire()
  })

  it('should collect an event that is followed by page activity', (done) => {
    const activityObservable = new Observable<PageActivityEvent>()

    const startTime = performance.now()
    waitUserActionCompletion(activityObservable, (endTime) => {
      expect(endTime).toEqual(startTime + BEFORE_USER_ACTION_VALIDATION_DELAY)
      done()
    })

    clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
    activityObservable.notify({ isBusy: false })

    clock.expire()
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()

      // Extend the user action but stops before USER_ACTION_MAX_DURATION
      const extendCount = Math.floor(USER_ACTION_MAX_DURATION / BEFORE_USER_ACTION_END_DELAY - 1)

      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + (extendCount + 1) * BEFORE_USER_ACTION_END_DELAY)
        done()
      })

      for (let i = 0; i < extendCount; i += 1) {
        clock.tick(BEFORE_USER_ACTION_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.expire()
    })

    it('expires after a limit', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false
      const startTime = performance.now()

      // Extend the user action until it's more than USER_ACTION_MAX_DURATION
      const extendCount = Math.ceil(USER_ACTION_MAX_DURATION / BEFORE_USER_ACTION_END_DELAY + 1)

      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + USER_ACTION_MAX_DURATION)
        stop = true
        done()
      })

      for (let i = 0; i < extendCount && !stop; i += 1) {
        clock.tick(BEFORE_USER_ACTION_END_DELAY)
        activityObservable.notify({ isBusy: false })
      }

      clock.expire()
    })
  })

  describe('busy activities', () => {
    it('is extended while the page is busy', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()
      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + BEFORE_USER_ACTION_VALIDATION_DELAY + USER_ACTION_END_DELAY * 2)
        done()
      })

      clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.tick(USER_ACTION_END_DELAY * 2)
      activityObservable.notify({ isBusy: false })

      clock.expire()
    })

    it('expires is the page is busy for too long', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()
      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + USER_ACTION_MAX_DURATION)
        done()
      })

      clock.tick(BEFORE_USER_ACTION_VALIDATION_DELAY)
      activityObservable.notify({ isBusy: true })

      clock.expire()
    })
  })
})
