import type { Context, ClocksState, Observable, Duration } from '@datadog/browser-core'
import { timeStampNow, resetExperimentalFeatures, updateExperimentalFeatures, relativeNow } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent } from '../../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import { RumEventType, ActionType, FrustrationType } from '../../../rawRumEvent.types'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitIdlePage'
import type { ActionContexts } from './actionCollection'
import type { ClickAction } from './trackClickActions'
import { CLICK_ACTION_MAX_DURATION, trackClickActions } from './trackClickActions'
import { MAX_DURATION_BETWEEN_CLICKS } from './rageClickChain'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = CLICK_ACTION_MAX_DURATION * 10

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

const RAW_ERROR_EVENT = { type: RumEventType.ERROR } as RumEvent & Context

describe('trackClickActions', () => {
  const { events, pushEvent } = eventsCollector<ClickAction>()
  let button: HTMLButtonElement
  let emptyElement: HTMLHRElement
  let input: HTMLInputElement
  let setupBuilder: TestSetupBuilder
  let findActionId: ActionContexts['findActionId']

  beforeEach(() => {
    button = document.createElement('button')
    button.type = 'button'
    button.appendChild(document.createTextNode('Click me'))
    document.body.appendChild(button)

    emptyElement = document.createElement('hr')
    document.body.appendChild(emptyElement)

    input = document.createElement('input')
    input.value = 'foo bar'
    document.body.appendChild(input)

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(({ lifeCycle, domMutationObservable, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, pushEvent)
        const trackClickActionsResult = trackClickActions(lifeCycle, domMutationObservable, configuration)
        findActionId = trackClickActionsResult.actionContexts.findActionId
        return { stop: trackClickActionsResult.stop }
      })
  })

  afterEach(() => {
    button.parentNode!.removeChild(button)
    emptyElement.parentNode!.removeChild(emptyElement)
    input.parentNode!.removeChild(input)
    setupBuilder.cleanup()
  })

  it('starts a click action when clicking on an element', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    emulateClickWithActivity(domMutationObservable, clock)
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)
    expect(events).toEqual([
      {
        counts: {
          errorCount: 0,
          longTaskCount: 0,
          resourceCount: 0,
        },
        duration: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY as Duration,
        id: jasmine.any(String),
        name: 'Click me',
        startClocks: jasmine.any(Object),
        type: ActionType.CLICK,
        event: createNewEvent('click'),
        frustrationTypes: [],
      },
    ])
  })

  it('should keep track of previously validated click actions', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    const clickActionStartTime = relativeNow()
    emulateClickWithActivity(domMutationObservable, clock)
    clock.tick(EXPIRE_DELAY)

    expect(findActionId(clickActionStartTime)).not.toBeUndefined()
  })

  it('counts errors occurring during the click action', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

    emulateClickWithActivity(domMutationObservable, clock)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

    clock.tick(EXPIRE_DELAY)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

    expect(events.length).toBe(1)
    const clickAction = events[0]
    expect(clickAction.counts).toEqual({
      errorCount: 2,
      longTaskCount: 0,
      resourceCount: 0,
    })
  })

  it('should take the name from user-configured attribute', () => {
    const { domMutationObservable, clock } = setupBuilder
      .withConfiguration({ actionNameAttribute: 'data-my-custom-attribute' })
      .build()

    button.setAttribute('data-my-custom-attribute', 'test-1')
    emulateClickWithActivity(domMutationObservable, clock)

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  describe('without frustration-signals flag', () => {
    it('discards any click action with a negative duration', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, button, -1)
      expect(findActionId()).not.toBeUndefined()
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('discards ongoing click action on view created', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('ignores any starting click action while another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].startClocks.timeStamp).toBe(firstClickTimeStamp)
    })

    it('discards a click action when nothing happens after a click', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity()

      clock.tick(EXPIRE_DELAY)
      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('ignores a click action if it fails to find a name', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, emptyElement)
      expect(findActionId()).toBeUndefined()
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
    })

    it('does not populate the frustrationTypes array', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

      emulateClickWithActivity(domMutationObservable, clock)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([])
    })
  })

  describe('with frustration-signals flag', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['frustration-signals'])
    })
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('discards any click action with a negative duration', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, button, -1)
      expect(findActionId()!.length).toEqual(2)
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toEqual([])
    })

    it("doesn't discard ongoing click action on view created", () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        id: 'fake',
        startClocks: jasmine.any(Object) as unknown as ClocksState,
      })
      clock.tick(EXPIRE_DELAY)

      expect(events.length).toBe(1)
    })

    it('collect click actions even if another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      const secondClickTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(2)
      expect(events[0].startClocks.timeStamp).toBe(firstClickTimeStamp)
      expect(events[1].startClocks.timeStamp).toBe(secondClickTimeStamp)
    })

    it('collect click actions even if nothing happens after a click (dead click)', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity()

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD])
      expect(findActionId()).toEqual([])
    })

    it('does not set a duration for dead clicks', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity()

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].duration).toBeUndefined()
    })

    it('collect click actions even if it fails to find a name', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, emptyElement)
      expect(findActionId()!.length).toBeGreaterThan(0)
      clock.tick(EXPIRE_DELAY)

      expect(events.length).toBe(1)
    })

    describe('rage clicks', () => {
      it('considers a chain of three clicks or more as a single action with "rage" frustration type', () => {
        const { domMutationObservable, clock } = setupBuilder.build()
        const firstClickTimeStamp = timeStampNow()
        const actionDuration = 5
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].startClocks.timeStamp).toBe(firstClickTimeStamp)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.RAGE])
        expect(events[0].duration).toBe((MAX_DURATION_BETWEEN_CLICKS + 2 * actionDuration) as Duration)
      })

      it('aggregates frustrationTypes from all clicks', () => {
        const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

        // Dead
        emulateClickWithoutActivity()
        clock.tick(PAGE_ACTIVITY_VALIDATION_DELAY)

        // Error
        emulateClickWithActivity(domMutationObservable, clock)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)
        clock.tick(PAGE_ACTIVITY_VALIDATION_DELAY)

        // Third click to make a rage click
        emulateClickWithActivity(domMutationObservable, clock)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual(
          jasmine.arrayWithExactContents([FrustrationType.DEAD, FrustrationType.ERROR, FrustrationType.RAGE])
        )
      })
    })

    describe('error clicks', () => {
      // eslint-disable-next-line max-len
      it('considers a "click with activity" followed by an error as a click action with "error" frustration type', () => {
        const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

        emulateClickWithActivity(domMutationObservable, clock)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.ERROR])
      })

      // eslint-disable-next-line max-len
      it('considers a "click without activity" followed by an error as a click action with "error" (and "dead") frustration type', () => {
        const { lifeCycle, clock } = setupBuilder.build()

        emulateClickWithoutActivity()
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual(
          jasmine.arrayWithExactContents([FrustrationType.ERROR, FrustrationType.DEAD])
        )
      })
    })

    describe('dead clicks', () => {
      it('considers a "click without activity" as a dead click', () => {
        const { clock } = setupBuilder.build()

        emulateClickWithoutActivity()

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD])
      })
    })
  })

  function emulateClickWithActivity(
    domMutationObservable: Observable<void>,
    clock: Clock,
    target: HTMLElement = button,
    clickActionDuration: number = BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY
  ) {
    emulateClickWithoutActivity(target)
    clock.tick(clickActionDuration)
    // Since we don't collect dom mutations for this test, manually dispatch one
    domMutationObservable.notify()
  }

  function emulateClickWithoutActivity(target: HTMLElement = button) {
    const targetPosition = target.getBoundingClientRect()
    target.dispatchEvent(
      createNewEvent('click', {
        target,
        clientX: targetPosition.left + targetPosition.width / 2,
        clientY: targetPosition.top + targetPosition.height / 2,
        timeStamp: timeStampNow(),
      })
    )
  }
})
