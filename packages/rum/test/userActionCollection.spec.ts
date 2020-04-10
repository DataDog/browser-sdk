import { DOM_EVENT, Observable, RequestCompleteEvent } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import {
  $$tests,
  AutoUserAction,
  getUserActionReference,
  PageActivityEvent,
  startUserActionCollection,
  USER_ACTION_MAX_DURATION,
  UserAction,
  UserActionType,
} from '../src/userActionCollection'
const { waitUserActionCompletion, trackPageActivities, resetUserAction, newUserAction } = $$tests

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
      jasmine.clock().tick(USER_ACTION_MAX_DURATION * 10)
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

  it('starts a user action when clicking on an element', () => {
    button.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(50)
      // Since we don't collect dom mutations for this test, manually dispatch one
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    clock.tick(50)
    button.click()

    clock.expire()
    expect(events).toEqual([
      {
        duration: 50,
        id: jasmine.any(String),
        name: 'Click me',
        startTime: jasmine.any(Number),
        type: UserActionType.CLICK,
      },
    ])
  })

  it('cancels a user action when if nothing happens after a click', () => {
    clock.tick(50)
    button.click()

    clock.expire()
    expect(events).toEqual([])
  })
})

describe('getUserActionReference', () => {
  const clock = mockClock()

  beforeEach(() => {
    resetUserAction()
  })

  it('returns the current user action reference', () => {
    expect(getUserActionReference()).toBeUndefined()
    const lifeCycle = new LifeCycle()
    const spy = jasmine.createSpy<(arg: UserAction) => void>()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, spy)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test')

    const userActionReference = getUserActionReference(Date.now())!

    expect(userActionReference).toBeDefined()

    clock.tick(80)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    expect(getUserActionReference()).toBeDefined()

    clock.expire()

    expect(getUserActionReference()).toBeUndefined()

    const userAction = spy.calls.argsFor(0)[0] as AutoUserAction
    expect(userAction.id).toBe(userActionReference.id)
  })

  it('do not return the user action reference for events occuring before the start of the user action', () => {
    clock.tick(50)
    newUserAction(new LifeCycle(), UserActionType.CLICK, 'test')

    clock.tick(50)
    expect(getUserActionReference()).toBeDefined()
    expect(getUserActionReference(Date.now() - 20)).toBeDefined()
    expect(getUserActionReference(Date.now() - 100)).toBeUndefined()

    clock.expire()
  })
})

describe('newUserAction', () => {
  const clock = mockClock()

  it('cancels any starting user action while another one is happening', () => {
    const lifeCycle = new LifeCycle()
    const spy = jasmine.createSpy<(arg: UserAction) => void>()
    lifeCycle.subscribe(LifeCycleEventType.USER_ACTION_COLLECTED, spy)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test-1')
    newUserAction(lifeCycle, UserActionType.CLICK, 'test-2')

    clock.tick(80)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    clock.expire()
    expect(spy).toHaveBeenCalledTimes(1)
    const userAction = spy.calls.argsFor(0)[0]
    expect(userAction.name).toBe('test-1')
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
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      // tslint:disable-next-line no-object-literal-type-assertion
      entryType: 'resource',
    } as PerformanceEntry)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    const lifeCycle = new LifeCycle()
    trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      // tslint:disable-next-line no-object-literal-type-assertion
      entryType: 'navigation',
    } as PerformanceEntry)
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
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 10,
      } as RequestCompleteEvent)
      expect(events).toEqual([{ isBusy: true }, { isBusy: false }])
    })

    it('ignores requests that has started before', () => {
      const lifeCycle = new LifeCycle()
      trackPageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 10,
      } as RequestCompleteEvent)
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
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 9,
      } as RequestCompleteEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 11,
      } as RequestCompleteEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 10,
      } as RequestCompleteEvent)
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
      expect(endTime).toEqual(startTime + 80)
      done()
    })

    clock.tick(80)
    activityObservable.notify({ isBusy: false })

    clock.expire()
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      const startTime = performance.now()
      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + 5 * 80)
        done()
      })

      for (let i = 0; i < 5; i += 1) {
        clock.tick(80)
        activityObservable.notify({ isBusy: false })
      }

      clock.expire()
    })

    it('expires after a limit', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      let stop = false
      const startTime = performance.now()
      waitUserActionCompletion(activityObservable, (endTime) => {
        expect(endTime).toBe(startTime + USER_ACTION_MAX_DURATION)
        stop = true
        done()
      })

      for (let i = 0; i < 500 && !stop; i += 1) {
        clock.tick(80)
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
        expect(endTime).toBe(startTime + 580)
        done()
      })

      clock.tick(80)
      activityObservable.notify({ isBusy: true })

      clock.tick(500)
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

      clock.tick(80)
      activityObservable.notify({ isBusy: true })

      clock.expire()
    })
  })
})
