import { DOM_EVENT, ErrorMessage } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { PAGE_ACTIVITY_MAX_DURATION, PAGE_ACTIVITY_VALIDATION_DELAY } from '../src/trackPageActivities'
import {
  $$tests,
  AutoUserAction,
  getUserActionReference,
  UserAction,
  UserActionType,
} from '../src/userActionCollection'
import { setup, TestSetupBuilder } from './specHelper'

const { resetUserAction, newUserAction } = $$tests

// Used to wait some time after the creation of a user action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time but it doesn't matter how much.
const SOME_ARBITRARY_DELAY = 50
// A long delay used to wait after any user action is finished.
const EXPIRE_DELAY = PAGE_ACTIVITY_MAX_DURATION * 10

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
  let button: HTMLButtonElement
  let emptyElement: HTMLHRElement
  let setupBuilder: TestSetupBuilder

  function mockValidatedClickUserAction(lifeCycle: LifeCycle, clock: jasmine.Clock, target: HTMLElement) {
    target.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      // Since we don't collect dom mutations for this test, manually dispatch one
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    clock.tick(SOME_ARBITRARY_DELAY)
    target.click()
  }

  beforeEach(() => {
    button = document.createElement('button')
    button.type = 'button'
    button.appendChild(document.createTextNode('Click me'))
    document.body.appendChild(button)

    emptyElement = document.createElement('hr')
    document.body.appendChild(emptyElement)

    setupBuilder = setup()
      .withFakeClock()
      .withUserActionCollection()
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, pushEvent))
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    setupBuilder.cleanup()
  })

  it('cancels pending user action on view loading', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickUserAction(lifeCycle, clock, button)

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED)
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
  })

  it('starts a user action when clicking on an element', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickUserAction(lifeCycle, clock, button)
    clock.tick(EXPIRE_DELAY)
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
    const { clock } = setupBuilder.build()
    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()

    clock.tick(EXPIRE_DELAY)
    expect(events).toEqual([])
  })

  it('ignores a user actions if it fails to find a name', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickUserAction(lifeCycle, clock, emptyElement)
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
  })
})

describe('getUserActionReference', () => {
  let setupBuilder: TestSetupBuilder
  const { events, pushEvent } = eventsCollector<UserAction>()

  beforeEach(() => {
    setupBuilder = setup().withFakeClock()
  })

  afterEach(() => {
    resetUserAction()
    setupBuilder.cleanup()
  })

  it('returns the current user action reference', () => {
    const { clock } = setupBuilder.build()
    expect(getUserActionReference()).toBeUndefined()
    const lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test')

    const userActionReference = getUserActionReference(Date.now())!

    expect(userActionReference).toBeDefined()

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    expect(getUserActionReference()).toBeDefined()

    clock.tick(EXPIRE_DELAY)

    expect(getUserActionReference()).toBeUndefined()

    const userAction = events[0] as AutoUserAction
    expect(userAction.id).toBe(userActionReference.id)
  })

  it('do not return the user action reference for events occurring before the start of the user action', () => {
    const { clock } = setupBuilder.build()
    const timeBeforeStartingUserAction = Date.now()

    clock.tick(SOME_ARBITRARY_DELAY)
    newUserAction(new LifeCycle(), UserActionType.CLICK, 'test')

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.5)
    const timeAfterStartingUserAction = Date.now()
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.5)

    expect(getUserActionReference()).toBeDefined()
    expect(getUserActionReference(timeAfterStartingUserAction)).toBeDefined()
    expect(getUserActionReference(timeBeforeStartingUserAction)).toBeUndefined()

    clock.tick(EXPIRE_DELAY)
  })
})

describe('newUserAction', () => {
  let setupBuilder: TestSetupBuilder
  const { events, pushEvent } = eventsCollector<UserAction>()

  beforeEach(() => {
    setupBuilder = setup().withFakeClock()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('cancels any starting user action while another one is happening', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test-1')
    newUserAction(lifeCycle, UserActionType.CLICK, 'test-2')

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  it('counts errors occurring during the user action', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    const error = {}
    lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, pushEvent)

    newUserAction(lifeCycle, UserActionType.CLICK, 'test-1')

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)

    clock.tick(EXPIRE_DELAY)
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
