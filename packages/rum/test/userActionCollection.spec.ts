import { DOM_EVENT, ErrorMessage } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { RumSession } from '../src/rumSession'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
  PageActivityEvent,
  waitPageActivitiesCompletion,
} from '../src/trackPageActivities'
import {
  $$tests,
  AutoUserAction,
  getUserActionReference,
  startUserActionCollection,
  UserAction,
  UserActionType,
} from '../src/userActionCollection'
const { resetUserAction, newUserAction } = $$tests
import { newView, ViewLoadType } from '../src/viewCollection'

// Used to wait some time after the creation of a user action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time but it doesn't matter how much.
const SOME_ARBITRARY_DELAY = 50
// A long delay used to wait after any user action is finished.
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
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      // Since we don't collect dom mutations for this test, manually dispatch one
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()

    clock.expire()
  }

  it('cancels pending user action on view loading', () => {
    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    const fakeSession = {
      getId() {
        return '42'
      },
    }

    button.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      // Since we don't collect dom mutations for this test, manually dispatch one
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()
    newView(lifeCycle, fakeLocation as Location, fakeSession as RumSession, ViewLoadType.INITIAL_LOAD)
    clock.expire()

    expect(events).toEqual([])
  })

  it('starts a user action when clicking on an element', () => {
    mockValidatedClickUserAction()
    expect(events).toEqual([
      {
        duration: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY,
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

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
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

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.5)
    const timeAfterStartingUserAction = Date.now()
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.5)

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

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
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
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
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
