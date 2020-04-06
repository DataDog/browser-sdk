import { Observable, RequestCompleteEvent } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { UserActionType } from '../src/rum'
import { $$tests, getUserActionId, PageActivityEvent, startUserActionCollection } from '../src/userActionCollection'
const { newUserAction, trackPagePageActivities, resetUserAction } = $$tests

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
      jasmine.clock().tick(100_000)
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

describe('newUserAction', () => {
  const clock = mockClock()

  it("starts a new user action, but don't validate it", (done) => {
    newUserAction(new Observable(), (details) => {
      expect(details).toBeUndefined()
      done()
    })

    clock.expire()
  })

  it('starts a new user action, and validate it', (done) => {
    const activityObservable = new Observable<PageActivityEvent>()

    newUserAction(activityObservable, (details) => {
      expect(details).toEqual({
        duration: 80,
        id: (jasmine.any(String) as unknown) as string,
        startTime: (jasmine.any(Number) as unknown) as number,
      })
      done()
    })

    clock.tick(80)
    activityObservable.notify({ isBusy: false })

    clock.expire()
  })

  it('cancels any starting user action while another one is happening', (done) => {
    let count = 2
    const activityObservable = new Observable<PageActivityEvent>()
    newUserAction(activityObservable, (details) => {
      expect(details).toBeDefined()
      count -= 1
      if (count === 0) {
        done()
      }
    })
    newUserAction(activityObservable, (details) => {
      expect(details).toBeUndefined()
      count -= 1
      if (count === 0) {
        done()
      }
    })

    clock.tick(80)
    activityObservable.notify({ isBusy: false })

    clock.expire()
  })

  describe('extend with activities', () => {
    it('is extended while there is page activities', (done) => {
      const activityObservable = new Observable<PageActivityEvent>()
      newUserAction(activityObservable, (details) => {
        expect(details!.duration).toBe(5 * 80)
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
      newUserAction(activityObservable, (details) => {
        expect(details!.duration).toBe(10_000)
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
      newUserAction(activityObservable, (details) => {
        expect(details!.duration).toBe(580)
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
      newUserAction(activityObservable, (details) => {
        expect(details!.duration).toBe(10_000)
        done()
      })

      clock.tick(80)
      activityObservable.notify({ isBusy: true })

      clock.expire()
    })
  })
})

describe('getUserActionId', () => {
  const clock = mockClock()

  beforeEach(() => {
    resetUserAction()
  })

  it('returns the current user action id', (done) => {
    expect(getUserActionId(Date.now())).toBeUndefined()
    const activityObservable = new Observable<PageActivityEvent>()
    newUserAction(activityObservable, (details) => {
      expect(details!.id).toBe(userActionId)
      expect(getUserActionId(Date.now())).toBeUndefined()
      done()
    })

    const userActionId = getUserActionId(Date.now())!

    expect(userActionId).toBeDefined()

    clock.tick(80)
    activityObservable.notify({ isBusy: false })

    expect(getUserActionId(Date.now())).toBeDefined()

    clock.expire()
  })

  it('do not return the user action id for events occuring before the start of the user action', (done) => {
    const activityObservable = new Observable<PageActivityEvent>()
    const time = Date.now()
    clock.tick(50)
    newUserAction(activityObservable, done)

    clock.tick(50)
    expect(getUserActionId(time)).toBeUndefined()

    clock.expire()
  })
})

describe('trackPagePageActivities', () => {
  const { events, pushEvent } = eventsCollector<PageActivityEvent>()
  it('emits an activity event on dom mutation', () => {
    const lifeCycle = new LifeCycle()
    trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('emits an activity event on resource collected', () => {
    const lifeCycle = new LifeCycle()
    trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      // tslint:disable-next-line no-object-literal-type-assertion
      entryType: 'resource',
    } as PerformanceEntry)
    expect(events).toEqual([{ isBusy: false }])
  })

  it('does not emit an activity event when a navigation occurs', () => {
    const lifeCycle = new LifeCycle()
    trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      // tslint:disable-next-line no-object-literal-type-assertion
      entryType: 'navigation',
    } as PerformanceEntry)
    expect(events).toEqual([])
  })

  it('stops emiting activities after calling stop()', () => {
    const lifeCycle = new LifeCycle()
    const { stop, observable } = trackPagePageActivities(lifeCycle)
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
      trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_STARTED, {
        requestId: 10,
      })
      expect(events).toEqual([{ isBusy: true }])
    })

    it('emits an activity event when a request completes', () => {
      const lifeCycle = new LifeCycle()
      trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
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
      trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, {
        // tslint:disable-next-line no-object-literal-type-assertion
        requestId: 10,
      } as RequestCompleteEvent)
      expect(events).toEqual([])
    })

    it('keeps emiting busy events while all requests are not completed', () => {
      const lifeCycle = new LifeCycle()
      trackPagePageActivities(lifeCycle).observable.subscribe(pushEvent)
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
    button.addEventListener('click', () => {
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
