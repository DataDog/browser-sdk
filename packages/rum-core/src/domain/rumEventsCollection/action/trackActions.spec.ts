import { Context, DOM_EVENT, ClocksState } from '@datadog/browser-core'
import { Clock } from '../../../../../core/test/specHelper'
import { RumEvent } from '../../../../../rum/src'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType, ActionType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_MAX_DURATION, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../trackPageActivities'
import { AutoAction, trackActions } from './trackActions'

// Used to wait some time after the creation of a action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time but it doesn't matter how much.
const SOME_ARBITRARY_DELAY = 50
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

describe('trackActions', () => {
  const { events, pushEvent } = eventsCollector()
  let button: HTMLButtonElement
  let emptyElement: HTMLHRElement
  let namedButton: HTMLButtonElement
  let setupBuilder: TestSetupBuilder
  let createSpy: jasmine.Spy
  let discardSpy: jasmine.Spy

  function mockValidatedClickAction(lifeCycle: LifeCycle, clock: Clock, target: HTMLElement) {
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

    namedButton = document.createElement('button')
    namedButton.type = 'button'
    namedButton.setAttribute('data-dd-action-name', 'thinger')
    namedButton.appendChild(document.createTextNode('Click me too'))
    document.body.appendChild(namedButton)

    createSpy = jasmine.createSpy('create')
    discardSpy = jasmine.createSpy('discard')

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, createSpy)
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, discardSpy)
        return trackActions(lifeCycle)
      })
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    setupBuilder.cleanup()
  })

  it('discards pending action on view created', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickAction(lifeCycle, clock, button)
    expect(createSpy).toHaveBeenCalled()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      location,
      id: 'fake',
      referrer: 'http://foo.com',
      startClocks: (jasmine.any(Object) as unknown) as ClocksState,
    })
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
    expect(discardSpy).toHaveBeenCalled()
  })

  it('starts a action when clicking on an element', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickAction(lifeCycle, clock, button)
    expect(createSpy).toHaveBeenCalled()
    clock.tick(EXPIRE_DELAY)
    expect(events).toEqual([
      {
        counts: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        duration: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY,
        id: jasmine.any(String),
        name: 'Click me',
        startClocks: jasmine.any(Object),
        type: ActionType.CLICK,
      },
    ])
  })

  it('discards a action when nothing happens after a click', () => {
    const { clock } = setupBuilder.build()
    clock.tick(SOME_ARBITRARY_DELAY)
    button.click()

    clock.tick(EXPIRE_DELAY)
    expect(events).toEqual([])
    expect(discardSpy).toHaveBeenCalled()
  })

  it('keeps programmatically named actions even if nothing happens', () => {
    const { clock } = setupBuilder.build()

    clock.tick(SOME_ARBITRARY_DELAY)
    namedButton.click()
    clock.tick(EXPIRE_DELAY)

    expect(createSpy).toHaveBeenCalled()
    expect(events).toEqual([
      {
        counts: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        duration: undefined,
        id: jasmine.any(String),
        name: 'thinger',
        startClocks: jasmine.any(Object),
        type: ActionType.CLICK,
      },
    ])
  })

  it('ignores a actions if it fails to find a name', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    mockValidatedClickAction(lifeCycle, clock, emptyElement)
    expect(createSpy).not.toHaveBeenCalled()
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
  })
})

describe('newAction', () => {
  let setupBuilder: TestSetupBuilder
  const { events, pushEvent } = eventsCollector<AutoAction>()

  function newClick(name: string) {
    const button = document.createElement('button')
    button.setAttribute('title', name)
    document.getElementById('root')!.appendChild(button)
    button.click()
  }

  beforeEach(() => {
    const root = document.createElement('root')
    root.setAttribute('id', 'root')
    document.body.appendChild(root)
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle }) => trackActions(lifeCycle))
  })

  afterEach(() => {
    const root = document.getElementById('root')!
    root.parentNode!.removeChild(root)
    setupBuilder.cleanup()
  })

  it('ignores any starting action while another one is happening', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

    newClick('test-1')
    newClick('test-2')

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  it('counts errors occurring during the action', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    const collectedRumEvent = { type: RumEventType.ERROR } as RumEvent & Context
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

    newClick('test-1')

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, collectedRumEvent)
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, collectedRumEvent)

    clock.tick(EXPIRE_DELAY)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, collectedRumEvent)

    expect(events.length).toBe(1)
    const action = events[0]
    expect(action.counts).toEqual({
      errorCount: 2,
      longTaskCount: 0,
      resourceCount: 0,
    })
  })
})
