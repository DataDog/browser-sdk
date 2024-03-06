import type { Context, Duration } from '@datadog/browser-core'
import {
  addDuration,
  clocksNow,
  timeStampNow,
  relativeNow,
  isIE,
  addExperimentalFeatures,
  ExperimentalFeature,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../test'
import { setup, createFakeClick } from '../../../test'
import { RumEventType, ActionType, FrustrationType } from '../../rawRumEvent.types'
import type { RumEvent } from '../../rumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY } from '../waitPageActivityEnd'
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
    resetExperimentalFeatures()
  })

  it('starts a click action when clicking on an element', () => {
    const { clock } = setupBuilder.build()
    const pointerDownClocks = clocksNow()
    emulateClick({ activity: {} })
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)
    const domEvent = createNewEvent('pointerup', { target: document.createElement('button') })
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
        private_name: undefined,
        startClocks: {
          relative: addDuration(pointerDownClocks.relative, EMULATED_CLICK_DURATION),
          timeStamp: addDuration(pointerDownClocks.timeStamp, EMULATED_CLICK_DURATION),
        },
        type: ActionType.CLICK,
        event: domEvent,
        frustrationTypes: [],
        target: {
          selector: '#button',
          width: 100,
          height: 100,
        },
        position: { x: 50, y: 50 },
        events: [domEvent],
      },
    ])
  })

  it('should collect private_name if FF enabled ', () => {
    if (isIE()) {
      pending('IE is not supported')
    }
    addExperimentalFeatures([ExperimentalFeature.SELECTOR_FOR_PRIVATE_ACTION_NAME])
    const { clock } = setupBuilder.build()
    emulateClick({ activity: {} })
    expect(findActionId()).not.toBeUndefined()
    clock.tick(EXPIRE_DELAY)
    createNewEvent('pointerup', { target: document.createElement('button') })
    expect(events[0].private_name).toBe('#button')
  })

  it('should keep track of previously validated click actions', () => {
    const { clock } = setupBuilder.build()
    const pointerDownStart = relativeNow()
    emulateClick({ activity: {} })
    clock.tick(EXPIRE_DELAY)

    expect(findActionId(addDuration(pointerDownStart, EMULATED_CLICK_DURATION))).not.toBeUndefined()
  })

  it('counts errors occurring during the click action', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()

    emulateClick({ activity: {} })

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())

    clock.tick(EXPIRE_DELAY)
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())

    expect(events.length).toBe(1)
    const clickAction = events[0]
    expect(clickAction.counts).toEqual({
      errorCount: 2,
      longTaskCount: 0,
      resourceCount: 0,
    })
  })

  it('does not count child events unrelated to the click action', () => {
    const { lifeCycle, clock } = setupBuilder.build()

    emulateClick({ activity: {} })

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      action: { id: 'unrelated-action-id' },
    } as RumEvent & Context)

    clock.tick(EXPIRE_DELAY)

    expect(events.length).toBe(1)
    const clickAction = events[0]
    expect(clickAction.counts.resourceCount).toBe(0)
  })

  it('should take the name from user-configured attribute', () => {
    const { clock } = setupBuilder.withConfiguration({ actionNameAttribute: 'data-my-custom-attribute' }).build()

    button.setAttribute('data-my-custom-attribute', 'test-1')
    emulateClick({ activity: {} })

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].name).toBe('test-1')
  })

  it('discards any click action with a negative duration', () => {
    const { clock } = setupBuilder.build()
    emulateClick({ activity: { delay: -1 } })
    expect(findActionId()!.length).toEqual(2)
    clock.tick(EXPIRE_DELAY)

    expect(events).toEqual([])
    expect(findActionId()).toEqual([])
  })

  it('ongoing click action is stopped on view end', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    emulateClick({ activity: { delay: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY } })

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
      endClocks: clocksNow(),
    })

    expect(events.length).toBe(1)
    expect(events[0].duration).toBe((2 * BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY) as Duration)
  })

  it('collect click actions even if another one is ongoing', () => {
    const { clock } = setupBuilder.build()

    const firstPointerDownTimeStamp = timeStampNow()
    emulateClick({ activity: {} })
    const secondPointerDownTimeStamp = timeStampNow()
    emulateClick({ activity: {} })

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(2)
    expect(events[0].startClocks.timeStamp).toBe(addDuration(firstPointerDownTimeStamp, EMULATED_CLICK_DURATION))
    expect(events[1].startClocks.timeStamp).toBe(addDuration(secondPointerDownTimeStamp, EMULATED_CLICK_DURATION))
  })

  it('collect click actions even if nothing happens after a click (dead click)', () => {
    const { clock } = setupBuilder.build()
    emulateClick()

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD_CLICK])
    expect(findActionId()).toEqual([])
  })

  it('does not set a duration for dead clicks', () => {
    const { clock } = setupBuilder.build()
    emulateClick()

    clock.tick(EXPIRE_DELAY)
    expect(events.length).toBe(1)
    expect(events[0].duration).toBeUndefined()
  })

  it('collect click actions even if it fails to find a name', () => {
    const { clock } = setupBuilder.build()
    emulateClick({ activity: {}, target: emptyElement })
    expect(findActionId()!.length).toBeGreaterThan(0)
    clock.tick(EXPIRE_DELAY)

    expect(events.length).toBe(1)
  })

  describe('rage clicks', () => {
    it('considers a chain of three clicks or more as a single action with "rage" frustration type', () => {
      const { clock } = setupBuilder.build()
      const firstPointerDownTimeStamp = timeStampNow()
      const activityDelay = 5
      emulateClick({ activity: { delay: activityDelay } })
      emulateClick({ activity: { delay: activityDelay } })
      emulateClick({ activity: { delay: activityDelay } })

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].startClocks.timeStamp).toBe(addDuration(firstPointerDownTimeStamp, EMULATED_CLICK_DURATION))
      expect(events[0].frustrationTypes).toEqual([FrustrationType.RAGE_CLICK])
      expect(events[0].duration).toBe(
        (MAX_DURATION_BETWEEN_CLICKS + 2 * activityDelay + 2 * EMULATED_CLICK_DURATION) as Duration
      )
    })

    it('should contain original events from of rage sequence', () => {
      const { clock } = setupBuilder.build()
      const activityDelay = 5
      emulateClick({ activity: { delay: activityDelay } })
      emulateClick({ activity: { delay: activityDelay } })
      emulateClick({ activity: { delay: activityDelay } })

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.RAGE_CLICK])
      expect(events[0].events?.length).toBe(3)
    })

    it('aggregates frustrationTypes from all clicks', () => {
      const { lifeCycle, clock } = setupBuilder.build()

      // Dead
      emulateClick()
      clock.tick(PAGE_ACTIVITY_VALIDATION_DELAY)

      // Error
      emulateClick({ activity: {} })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())
      clock.tick(PAGE_ACTIVITY_VALIDATION_DELAY)

      // Third click to make a rage click
      emulateClick({ activity: {} })

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
      const { lifeCycle, clock } = setupBuilder.build()

      emulateClick({ activity: {} })
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.ERROR_CLICK])
    })

    it('considers a "click without activity" followed by an error as a click action with "error" (and "dead") frustration type', () => {
      const { lifeCycle, clock } = setupBuilder.build()

      emulateClick()
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeErrorEvent())

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

      emulateClick()

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([FrustrationType.DEAD_CLICK])
    })

    it('does not consider a click with activity happening on pointerdown as a dead click', () => {
      const { clock } = setupBuilder.build()

      emulateClick({ activity: { on: 'pointerdown' } })

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([])
    })

    it('activity happening on pointerdown is not taken into account for the action duration', () => {
      const { clock } = setupBuilder.build()

      emulateClick({ activity: { on: 'pointerdown' } })

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].duration).toBe(0 as Duration)
    })

    it('does not consider a click with activity happening on pointerup as a dead click', () => {
      const { clock } = setupBuilder.build()

      emulateClick({ activity: { on: 'pointerup' } })

      clock.tick(EXPIRE_DELAY)
      expect(events.length).toBe(1)
      expect(events[0].frustrationTypes).toEqual([])
    })
  })

  function emulateClick({
    target = button,
    activity,
  }: {
    target?: HTMLElement
    activity?: {
      delay?: number
      on?: 'pointerup' | 'click' | 'pointerdown'
    }
  } = {}) {
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
      isPrimary: true,
    }
    target.dispatchEvent(createNewEvent('pointerdown', eventProperties))
    emulateActivityIfNeeded('pointerdown')
    setupBuilder.clock!.tick(EMULATED_CLICK_DURATION)
    target.dispatchEvent(createNewEvent('pointerup', eventProperties))
    emulateActivityIfNeeded('pointerup')
    target.dispatchEvent(createNewEvent('click', eventProperties))
    emulateActivityIfNeeded('click')

    function emulateActivityIfNeeded(event: 'pointerdown' | 'pointerup' | 'click') {
      if (activity && (activity.on ?? 'click') === event) {
        const delay = activity.delay ?? BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY
        if (delay < 0) {
          // Do not use `.tick()` here because negative clock tick does not work since jasmine 4: https://github.com/jasmine/jasmine/pull/1948
          setupBuilder.clock!.setDate(new Date(Date.now() + delay))
        } else {
          setupBuilder.clock!.tick(delay)
        }
        // Since we don't collect dom mutations for this test, manually dispatch one
        setupBuilder.domMutationObservable.notify()
      }
    }
  }

  function createFakeErrorEvent() {
    return { type: RumEventType.ERROR, action: { id: findActionId() } } as RumEvent & Context
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
