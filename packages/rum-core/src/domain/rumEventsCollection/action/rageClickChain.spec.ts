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
import type { PotentialClickAction } from './trackClickActions'

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
    clickChain = createRageClickChain(createFakePotentialClickAction())
    expect(clickChain).toEqual({
      tryAppend: jasmine.any(Function),
      stop: jasmine.any(Function),
    })
  })

  it('appends a potential click action', () => {
    clickChain = createRageClickChain(createFakePotentialClickAction())
    expect(clickChain.tryAppend(createFakePotentialClickAction())).toBe(true)
  })

  describe('flush', () => {
    it('flushes if we try to append a non-similar potential click action', () => {
      const firstPotentialClickAction = createFakePotentialClickAction({ target: document.documentElement })
      clickChain = createRageClickChain(firstPotentialClickAction)
      firstPotentialClickAction.stop()
      clickChain.tryAppend(createFakePotentialClickAction({ target: document.body }))
      expect(firstPotentialClickAction.validate).toHaveBeenCalled()
    })

    it('does not flush until it waited long enough to ensure no other potential click action can be appended', () => {
      const firstPotentialClickAction = createFakePotentialClickAction()
      clickChain = createRageClickChain(firstPotentialClickAction)
      firstPotentialClickAction.stop()
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(firstPotentialClickAction.validate).not.toHaveBeenCalled()
      clock.tick(1)
      expect(firstPotentialClickAction.validate).toHaveBeenCalled()
    })

    it('does not flush until all potential click actions are stopped', () => {
      const firstPotentialClickAction = createFakePotentialClickAction()
      clickChain = createRageClickChain(firstPotentialClickAction)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(firstPotentialClickAction.validate).not.toHaveBeenCalled()
      firstPotentialClickAction.stop()
      expect(firstPotentialClickAction.validate).toHaveBeenCalled()
    })

    it('flushes when stopping the click chain', () => {
      const firstPotentialClickAction = createFakePotentialClickAction({ target: document.documentElement })
      clickChain = createRageClickChain(firstPotentialClickAction)
      firstPotentialClickAction.stop()
      clickChain.stop()
      expect(firstPotentialClickAction.validate).toHaveBeenCalled()
    })
  })

  describe('potential click actions similarity', () => {
    it('does not accept a potential click action if its timestamp is long after the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialClickAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(clickChain.tryAppend(createFakePotentialClickAction())).toBe(false)
    })

    it('does not accept a potential click action if its target is different', () => {
      clickChain = createRageClickChain(createFakePotentialClickAction({ target: document.documentElement }))
      expect(clickChain.tryAppend(createFakePotentialClickAction({ target: document.body }))).toBe(false)
    })

    it('does not accept a potential click action if its location is far from the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialClickAction({ clientX: 100, clientY: 100 }))
      expect(
        clickChain.tryAppend(
          createFakePotentialClickAction({ clientX: 100, clientY: 100 + MAX_DISTANCE_BETWEEN_CLICKS + 1 })
        )
      ).toBe(false)
    })

    it('considers potential click actions relative to the previous one', () => {
      clickChain = createRageClickChain(createFakePotentialClickAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      clickChain.tryAppend(createFakePotentialClickAction())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(clickChain.tryAppend(createFakePotentialClickAction())).toBe(true)
    })
  })

  describe('when rage is detected', () => {
    it('discards individual potential click actions', () => {
      const potentialClickActions = [
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
      ]
      createValidatedRageClickChain(potentialClickActions)
      potentialClickActions.forEach((action) => expect(action.discard).toHaveBeenCalled())
    })

    it('uses a clone of the first action to represent the rage click action', () => {
      const potentialClickActions = [
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
      ]
      createValidatedRageClickChain(potentialClickActions)
      expect(potentialClickActions[0].clonedAction).toBeTruthy()
      expect(potentialClickActions[0].clonedAction?.validate).toHaveBeenCalled()
    })

    it('the rage click action should have a "rage" frustration', () => {
      const potentialClickActions = [
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
      ]
      createValidatedRageClickChain(potentialClickActions)
      const expectedFrustrations = new Set()
      expectedFrustrations.add(FrustrationType.RAGE)
      expect(potentialClickActions[0].clonedAction?.getFrustrations()).toEqual(expectedFrustrations)
    })

    it('the rage click action should contains other potential click actions frustration', () => {
      const potentialClickActions = [
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
        createFakePotentialClickAction(),
      ]
      potentialClickActions[1].addFrustration(FrustrationType.DEAD)
      createValidatedRageClickChain(potentialClickActions)
      expect(potentialClickActions[0].clonedAction?.getFrustrations().has(FrustrationType.RAGE)).toBe(true)
    })

    function createValidatedRageClickChain(potentialClickActions: PotentialClickAction[]) {
      clickChain = createRageClickChain(potentialClickActions[0])
      potentialClickActions.slice(1).forEach((action) => clickChain!.tryAppend(action))
      potentialClickActions.forEach((action) => action.stop())
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
    expect(
      isRage([createFakePotentialClickAction(), createFakePotentialClickAction(), createFakePotentialClickAction()])
    ).toBe(true)
  })

  it('does not consider as rage two clicks happening at the same time', () => {
    expect(isRage([createFakePotentialClickAction(), createFakePotentialClickAction()])).toBe(false)
  })

  it('does not consider as rage the first potential click action is long before two fast clicks', () => {
    const potentialClickActions = [createFakePotentialClickAction()]
    clock.tick(ONE_SECOND * 2)
    potentialClickActions.push(createFakePotentialClickAction(), createFakePotentialClickAction())

    expect(isRage(potentialClickActions)).toBe(false)
  })

  it('considers as rage even if the first potential click action is long before three fast clicks', () => {
    const potentialClickActions = [createFakePotentialClickAction()]
    clock.tick(ONE_SECOND * 2)
    potentialClickActions.push(
      createFakePotentialClickAction(),
      createFakePotentialClickAction(),
      createFakePotentialClickAction()
    )

    expect(isRage(potentialClickActions)).toBe(true)
  })

  it('considers as rage even if the last potential click action is long after three fast clicks', () => {
    const potentialClickActions = [
      createFakePotentialClickAction(),
      createFakePotentialClickAction(),
      createFakePotentialClickAction(),
    ]
    clock.tick(ONE_SECOND * 2)
    potentialClickActions.push(createFakePotentialClickAction())

    expect(isRage(potentialClickActions)).toBe(true)
  })
})

function createFakePotentialClickAction(
  eventPartial?: Partial<MouseEvent>
): PotentialClickAction & { clonedAction?: PotentialClickAction } {
  let onStopCallback = noop
  let clonedAction: PotentialClickAction | undefined
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
    } as PotentialClickAction['base'],
    onStop: (newOnStopCallback) => {
      onStopCallback = newOnStopCallback
    },
    stop: () => {
      onStopCallback()
    },
    clone: () => {
      clonedAction = createFakePotentialClickAction(eventPartial)
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
