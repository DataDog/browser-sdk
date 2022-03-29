import type { Context, ClocksState, Observable } from '@datadog/browser-core'
import { resetExperimentalFeatures, updateExperimentalFeatures, relativeNow, DOM_EVENT } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent } from '../../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import { RumEventType, ActionType } from '../../../rawRumEvent.types'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitIdlePage'
import type { ActionContexts } from './actionCollection'
import type { AutoAction } from './trackActions'
import { AUTO_ACTION_MAX_DURATION, trackActions } from './trackActions'

// Used to wait some time after the creation of a action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// Used to wait some time but it doesn't matter how much.
const SOME_ARBITRARY_DELAY = 50
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = AUTO_ACTION_MAX_DURATION * 10

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
  let findActionId: ActionContexts['findActionId']

  function mockValidatedClickAction(
    domMutationObservable: Observable<void>,
    clock: Clock,
    target: HTMLElement,
    actionDuration: number = BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY
  ) {
    target.addEventListener(DOM_EVENT.CLICK, () => {
      clock.tick(actionDuration)
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

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, domMutationObservable, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)
        const trackActionsResult = trackActions(lifeCycle, domMutationObservable, configuration)
        findActionId = trackActionsResult.actionContexts.findActionId
        return { stop: trackActionsResult.stop }
      })
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    setupBuilder.cleanup()
  })

  describe('without frustration-signals flag', () => {
    it('discards pending action on view created', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      mockValidatedClickAction(domMutationObservable, clock, button)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })
  })

  describe('with frustration-signals flag', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['frustration-signals'])
    })
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it("doesn't discard pending action on view created", () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      mockValidatedClickAction(domMutationObservable, clock, button)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events.length).toBe(1)
    })
  })

  it('starts a action when clicking on an element', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, button)
    expect(findActionId()).not.toBeUndefined()
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
    expect(findActionId()).toBeUndefined()
  })

  it('discards a pending action with a negative duration', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, button, -1)
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
    expect(findActionId()).toBeUndefined()
  })

  it('ignores a actions if it fails to find a name', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, emptyElement)
    expect(findActionId()).toBeUndefined()
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
  })

  it('should keep track of previously validated actions', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    mockValidatedClickAction(domMutationObservable, clock, button)
    const actionStartTime = relativeNow()
    clock.tick(EXPIRE_DELAY)

    expect(findActionId(actionStartTime)).not.toBeUndefined()
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

  describe('without frustration-signals flag', () => {
    it('ignores any starting action while another one is ongoing', () => {
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
  })

  describe('with frustration-signals flag', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['frustration-signals'])
    })
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('collect actions even if another one is ongoing', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)

      newClick('test-1')
      newClick('test-2')

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      domMutationObservable.notify()

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(2)
      expect(events[0].name).toBe('test-1')
      expect(events[1].name).toBe('test-2')
    })
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
