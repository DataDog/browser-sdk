import { noop, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock, createNewEvent } from '@datadog/browser-core/test/specHelper'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { RageClickChain } from './rageClickChain'
import {
  MAX_DISTANCE_BETWEEN_CLICKS,
  MAX_DURATION_BETWEEN_CLICKS,
  createRageClickChain,
  isRage,
} from './rageClickChain'
import type { PotentialAction } from './trackClickActions'

describe('createRageClickChain', () => {
  let clickChain: RageClickChain | undefined
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clickChain?.stop()
    clock.cleanup()
  })

  it('creates a click chain', () => {
    clickChain = createRageClickChain(createFakePotentialAction())
    expect(clickChain).toEqual({
      tryAppend: jasmine.any(Function),
      stop: jasmine.any(Function),
    })
  })

  it('appends a click action', () => {
    clickChain = createRageClickChain(createFakePotentialAction())
    expect(clickChain.tryAppend(createFakePotentialAction())).toBe(true)
  })

  describe('flush', () => {
    it('flushes if we try to append a non-similar click action', () => {
      const firstAction = createFakePotentialAction({ target: document.documentElement })
      clickChain = createRageClickChain(firstAction)
      firstAction.stop()
      clickChain.tryAppend(createFakePotentialAction({ target: document.body }))
      expect(firstAction.validate).toHaveBeenCalled()
    })

    it('does not flush until it waited long enough to ensure no other click action can be appended', () => {
      const firstAction = createFakePotentialAction()
      clickChain = createRageClickChain(firstAction)
      firstAction.stop()
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(firstAction.validate).not.toHaveBeenCalled()
      clock.tick(1)
      expect(firstAction.validate).toHaveBeenCalled()
    })

    it('does not flush until all click actions are stopped', () => {
      const firstAction = createFakePotentialAction()
      clickChain = createRageClickChain(firstAction)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(firstAction.validate).not.toHaveBeenCalled()
      firstAction.stop()
      expect(firstAction.validate).toHaveBeenCalled()
    })

    it('flushes when stopping the click chain', () => {
      const firstAction = createFakePotentialAction({ target: document.documentElement })
      clickChain = createRageClickChain(firstAction)
      firstAction.stop()
      clickChain.stop()
      expect(firstAction.validate).toHaveBeenCalled()
    })
  })

  describe('click actions similarity', () => {
    it('does not accept a click action if its timestamp is long after the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(clickChain.tryAppend(createFakePotentialAction())).toBe(false)
    })

    it('does not accept a click action if its target is different', () => {
      clickChain = createRageClickChain(createFakePotentialAction({ target: document.documentElement }))
      expect(clickChain.tryAppend(createFakePotentialAction({ target: document.body }))).toBe(false)
    })

    it('does not accept a click action if its location is far from the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialAction({ clientX: 100, clientY: 100 }))
      expect(
        clickChain.tryAppend(
          createFakePotentialAction({ clientX: 100, clientY: 100 + MAX_DISTANCE_BETWEEN_CLICKS + 1 })
        )
      ).toBe(false)
    })

    it('considers click actions relative to the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      clickChain.tryAppend(createFakePotentialAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(clickChain.tryAppend(createFakePotentialAction())).toBe(true)
    })
  })

  describe('when rage is detected', () => {
    it('discards individual click actions', () => {
      const clickActions = [createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()]
      createValidatedRageClickChain(clickActions)
      clickActions.forEach((action) => expect(action.discard).toHaveBeenCalled())
    })

    it('uses a clone of the first action to represent the rage click action', () => {
      const clickActions = [createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()]
      createValidatedRageClickChain(clickActions)
      expect(clickActions[0].clonedAction).toBeTruthy()
      expect(clickActions[0].clonedAction?.validate).toHaveBeenCalled()
    })

    it('the rage click action should have a "rage" frustration', () => {
      const clickActions = [createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()]
      createValidatedRageClickChain(clickActions)
      const expectedFrustrations = new Set()
      expectedFrustrations.add(FrustrationType.RAGE)
      expect(clickActions[0].clonedAction?.getFrustrations()).toEqual(expectedFrustrations)
    })

    it('the rage click action should contains other actions frustration', () => {
      const clickActions = [createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()]
      clickActions[1].addFrustration(FrustrationType.DEAD)
      createValidatedRageClickChain(clickActions)
      expect(clickActions[0].clonedAction?.getFrustrations().has(FrustrationType.RAGE)).toBe(true)
    })

    function createValidatedRageClickChain(clickActions: PotentialAction[]) {
      clickChain = createRageClickChain(clickActions[0])
      clickActions.slice(1).forEach((action) => clickChain!.tryAppend(action))
      clickActions.forEach((action) => action.stop())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
    }
  })
})

describe('isRage', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('considers as rage three clicks happening at the same time', () => {
    expect(isRage([createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()])).toBe(true)
  })

  it('does not consider as rage two clicks happening at the same time', () => {
    expect(isRage([createFakePotentialAction(), createFakePotentialAction()])).toBe(false)
  })

  it('does not consider as rage the first click action is long before two fast clicks', () => {
    const actions = [createFakePotentialAction()]
    clock.tick(ONE_SECOND * 2)
    actions.push(createFakePotentialAction(), createFakePotentialAction())

    expect(isRage(actions)).toBe(false)
  })

  it('considers as rage even if the first click action is long before three fast clicks', () => {
    const actions = [createFakePotentialAction()]
    clock.tick(ONE_SECOND * 2)
    actions.push(createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction())

    expect(isRage(actions)).toBe(true)
  })

  it('considers as rage even if the last click action is long after three fast clicks', () => {
    const actions = [createFakePotentialAction(), createFakePotentialAction(), createFakePotentialAction()]
    clock.tick(ONE_SECOND * 2)
    actions.push(createFakePotentialAction())

    expect(isRage(actions)).toBe(true)
  })
})

function createFakePotentialAction(
  eventPartial?: Partial<MouseEvent>
): PotentialAction & { clonedAction?: PotentialAction } {
  let onStopCallback = noop
  let clonedAction: PotentialAction | undefined
  const frustrations = new Set<FrustrationType>()
  return {
    base: {
      event: createNewEvent('click', {
        element: document.body,
        clientX: 100,
        clientY: 100,
        timeStamp: timeStampNow(),
        ...eventPartial,
      }),
    } as PotentialAction['base'],
    onStop: (newOnStopCallback) => {
      onStopCallback = newOnStopCallback
    },
    stop: () => {
      onStopCallback()
    },
    clone: () => {
      clonedAction = createFakePotentialAction(eventPartial)
      return clonedAction
    },
    discard: jasmine.createSpy(),
    validate: jasmine.createSpy(),
    addFrustration: (frustration) => frustrations.add(frustration),
    getFrustrations: () => frustrations,

    get clonedAction() {
      return clonedAction
    },
  }
}
