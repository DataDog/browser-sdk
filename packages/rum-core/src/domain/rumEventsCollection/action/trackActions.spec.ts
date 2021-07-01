import { Context, DOM_EVENT, ClocksState, Observable } from '@datadog/browser-core'
import { Clock, createNewEvent } from '../../../../../core/test/specHelper'
import { RumEvent } from '../../../../../rum/src'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType, ActionType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
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
  let setupBuilder: TestSetupBuilder
  let createSpy: jasmine.Spy
  let discardSpy: jasmine.Spy

  function mockValidatedClickAction(domMutationObservable: Observable<void>, clock: Clock, target: HTMLElement) {
    target.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      // Since we don't collect dom mutations for this test, manually dispatch one
      domMutationObservable.notify()
    })

    clock.tick(SOME_ARBITRARY_DELAY)
    target.dispatchEvent(createNewEvent('click'))
  }

  beforeEach(() => {
    button = document.createElement('button')
    button.type = 'button'
    button.appendChild(document.createTextNode('Click me'))
    document.body.appendChild(button)

    emptyElement = document.createElement('hr')
    document.body.appendChild(emptyElement)

    createSpy = jasmine.createSpy('create')
    discardSpy = jasmine.createSpy('discard')

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, domMutationObservable, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, createSpy)
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, discardSpy)
        return trackActions(lifeCycle, domMutationObservable, configuration)
      })
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    setupBuilder.cleanup()
  })

  it('discards pending action on view created', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, button)
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
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, button)
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
        event: createNewEvent('click'),
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

  it('ignores a actions if it fails to find a name', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, emptyElement)
    expect(createSpy).not.toHaveBeenCalled()
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
  })
})

describe('newAction', () => {
  let setupBuilder: TestSetupBuilder
  const { events, pushEvent } = eventsCollector<AutoAction>()

  function newClick(name: string, attribute = 'title') {
    const button = document.createElement('button')
    button.setAttribute(attribute, name)
    document.getElementById('root')!.appendChild(button)
    button.click()
  }

  beforeEach(() => {
    const root = document.createElement('root')
    root.setAttribute('id', 'root')
    document.body.appendChild(root)
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, domMutationObservable, configuration }) =>
        trackActions(lifeCycle, domMutationObservable, configuration)
      )
  })

  afterEach(() => {
    const root = document.getElementById('root')!
    root.parentNode!.removeChild(root)
    setupBuilder.cleanup()
  })

  it('ignores any starting action while another one is happening', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

    newClick('test-1')
    newClick('test-2')

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  it('counts errors occurring during the action', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    const collectedRumEvent = { type: RumEventType.ERROR } as RumEvent & Context
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

    newClick('test-1')

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, collectedRumEvent)
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
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

  it('should take the name from user-configured attribute', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder
      .withConfiguration({ actionNameAttribute: 'data-my-custom-attribute' })
      .build()
    lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

    newClick('test-1', 'data-my-custom-attribute')

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })
})
