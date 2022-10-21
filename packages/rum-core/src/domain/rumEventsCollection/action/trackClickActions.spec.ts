import type { Context, Observable, Duration } from '@datadog/browser-core'
import {
  addDuration,
  updateExperimentalFeatures,
  resetExperimentalFeatures,
  clocksNow,
  timeStampNow,
  relativeNow,
} from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent } from '../../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import { RumEventType, ActionType, FrustrationType } from '../../../rawRumEvent.types'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { createFakeClick } from '../../../../test/createFakeClick'
import type { ActionContexts } from './actionCollection'
import type { ClickAction } from './trackClickActions'
import { finalizeClicks, CLICK_ACTION_MAX_DURATION, trackClickActions } from './trackClickActions'
import { MAX_DURATION_BETWEEN_CLICKS } from './clickChain'

// Used to wait some time after the creation of an action
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
// A long delay used to wait after any action is finished.
const EXPIRE_DELAY = CLICK_ACTION_MAX_DURATION * 10
// Arbitrary duration between pointerdown and pointerup for emulated clicks
const EMULATED_CLICK_DURATION = 80 as Duration

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
    button.id = 'button'
    button.style.width = '100px'
    button.style.height = '100px'
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
    const pointerDownClocks = clocksNow()
    emulateClickWithActivity(domMutationObservable, clock)
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)
    const domEvent = createNewEvent('click', { target: document.createElement('button') })
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
        startClocks: {
          relative: addDuration(pointerDownClocks.relative, EMULATED_CLICK_DURATION),
          timeStamp: addDuration(pointerDownClocks.timeStamp, EMULATED_CLICK_DURATION),
        },
        type: ActionType.CLICK,
        event: domEvent,
        frustrationTypes: [],
        target: undefined,
        position: undefined,
        events: [domEvent],
      },
    ])
  })

  describe('when clickmap ff is enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['clickmap'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should set click position and target', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      clock.tick(EXPIRE_DELAY)
      expect(events[0]).toEqual(
        jasmine.objectContaining({
          target: {
            selector: '#button',
            selector_combined: '#button',
            selector_stopping_when_unique: '#button',
            selector_all_together: '#button',
            width: 100,
            height: 100,
          },
          position: { x: 50, y: 50 },
        })
      )
    })
  })

  it('should keep track of previously validated click actions', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    const pointerDownStart = relativeNow()
    emulateClickWithActivity(domMutationObservable, clock)
    clock.tick(EXPIRE_DELAY)

    expect(findActionId(addDuration(pointerDownStart, EMULATED_CLICK_DURATION))).not.toBeUndefined()
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

  describe('without tracking frustrations', () => {
    it('discards any click action with a negative duration', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, button, -1)
      expect(findActionId()).not.toBeUndefined()
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('discards ongoing click action on view ended', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock)
      expect(findActionId()).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: clocksNow(),
      })
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toBeUndefined()
    })

    it('ignores any starting click action while another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstPointerDownTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].startClocks.timeStamp).toBe(addDuration(firstPointerDownTimeStamp, EMULATED_CLICK_DURATION))
    })

    it('discards a click action when nothing happens after a click', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity(clock)

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

  describe('when tracking frustrations', () => {
    beforeEach(() => {
      setupBuilder.withConfiguration({ trackFrustrations: true })
    })

    it('discards any click action with a negative duration', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, button, -1)
      expect(findActionId()!.length).toEqual(2)
      clock.tick(EXPIRE_DELAY)

      expect(events).toEqual([])
      expect(findActionId()).toEqual([])
    })

    it('ongoing click action is stopped on view end', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      emulateClickWithActivity(domMutationObservable, clock, button, BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: clocksNow(),
      })

      expect(events.length).toBe(1)
      expect(events[0].duration).toBe((2 * BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY) as Duration)
    })

    it('collect click actions even if another one is ongoing', () => {
      const { domMutationObservable, clock } = setupBuilder.build()

      const firstPointerDownTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)
      const secondPointerDownTimeStamp = timeStampNow()
      emulateClickWithActivity(domMutationObservable, clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(2)
      expect(events[0].startClocks.timeStamp).toBe(addDuration(firstPointerDownTimeStamp, EMULATED_CLICK_DURATION))
      expect(events[1].startClocks.timeStamp).toBe(addDuration(secondPointerDownTimeStamp, EMULATED_CLICK_DURATION))
    })

    it('collect click actions even if nothing happens after a click (dead click)', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity(clock)

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD_CLICK])
      expect(findActionId()).toEqual([])
    })

    it('does not set a duration for dead clicks', () => {
      const { clock } = setupBuilder.build()
      emulateClickWithoutActivity(clock)

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
        const firstPointerDownTimeStamp = timeStampNow()
        const actionDuration = 5
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].startClocks.timeStamp).toBe(addDuration(firstPointerDownTimeStamp, EMULATED_CLICK_DURATION))
        expect(events[0].frustrationTypes).toEqual([FrustrationType.RAGE_CLICK])
        expect(events[0].duration).toBe(
          (MAX_DURATION_BETWEEN_CLICKS + 2 * actionDuration + 2 * EMULATED_CLICK_DURATION) as Duration
        )
      })

      it('should contain original events from of rage sequence', () => {
        const { domMutationObservable, clock } = setupBuilder.build()
        const actionDuration = 5
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)
        emulateClickWithActivity(domMutationObservable, clock, undefined, actionDuration)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.RAGE_CLICK])
        expect(events[0].events?.length).toBe(3)
      })

      it('aggregates frustrationTypes from all clicks', () => {
        const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

        // Dead
        emulateClickWithoutActivity(clock)
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
          jasmine.arrayWithExactContents([
            FrustrationType.DEAD_CLICK,
            FrustrationType.ERROR_CLICK,
            FrustrationType.RAGE_CLICK,
          ])
        )
      })
    })

    describe('error clicks', () => {
      it('considers a "click with activity" followed by an error as a click action with "error" frustration type', () => {
        const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

        emulateClickWithActivity(domMutationObservable, clock)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.ERROR_CLICK])
      })

      it('considers a "click without activity" followed by an error as a click action with "error" (and "dead") frustration type', () => {
        const { lifeCycle, clock } = setupBuilder.build()

        emulateClickWithoutActivity(clock)
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, RAW_ERROR_EVENT)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual(
          jasmine.arrayWithExactContents([FrustrationType.ERROR_CLICK, FrustrationType.DEAD_CLICK])
        )
      })
    })

    describe('dead clicks', () => {
      it('considers a "click without activity" as a dead click', () => {
        const { clock } = setupBuilder.build()

        emulateClickWithoutActivity(clock)

        clock.tick(EXPIRE_DELAY)
        expect(events.length).toBe(1)
        expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD_CLICK])
      })
    })
  })

  function emulateClickWithActivity(
    domMutationObservable: Observable<void>,
    clock: Clock,
    target: HTMLElement = button,
    clickActionDuration: number = BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY
  ) {
    emulateClickWithoutActivity(clock, target)
    clock.tick(clickActionDuration)
    // Since we don't collect dom mutations for this test, manually dispatch one
    domMutationObservable.notify()
  }

  function emulateClickWithoutActivity(clock: Clock, target: HTMLElement = button) {
    const targetPosition = target.getBoundingClientRect()
    const offsetX = targetPosition.width / 2
    const offsetY = targetPosition.height / 2
    const eventProperties = {
      target,
      clientX: targetPosition.left + offsetX,
      clientY: targetPosition.top + offsetY,
      offsetX,
      offsetY,
      timeStamp: timeStampNow(),
    }
    target.dispatchEvent(createNewEvent('pointerdown', eventProperties))
    clock.tick(EMULATED_CLICK_DURATION)
    target.dispatchEvent(createNewEvent('pointerup', eventProperties))
    target.dispatchEvent(createNewEvent('click', eventProperties))
  }
})

describe('finalizeClicks', () => {
  describe('when no rage is detected', () => {
    it('discards the rage click', () => {
      const clicks = [createFakeClick(), createFakeClick()]
      const rageClick = createFakeClick()
      finalizeClicks(clicks, rageClick)
      expect(rageClick.discard).toHaveBeenCalled()
    })

    it('validates individual clicks', () => {
      const clicks = [createFakeClick(), createFakeClick()]
      const rageClick = createFakeClick()
      finalizeClicks(clicks, rageClick)
      clicks.forEach((click) => expect(click.validate).toHaveBeenCalled())
    })
  })

  describe('when rage is detected', () => {
    it('discards individual clicks', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      const rageClick = createFakeClick()
      finalizeClicks(clicks, rageClick)
      clicks.forEach((click) => expect(click.discard).toHaveBeenCalled())
    })

    it('validates the rage click', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      const rageClick = createFakeClick()
      finalizeClicks(clicks, rageClick)
      expect(rageClick.validate).toHaveBeenCalled()
    })

    it('the rage click should have a "rage" frustration', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      const rageClick = createFakeClick()
      finalizeClicks(clicks, rageClick)
      expect(rageClick.addFrustration).toHaveBeenCalledWith(FrustrationType.RAGE_CLICK)
    })
  })
})
