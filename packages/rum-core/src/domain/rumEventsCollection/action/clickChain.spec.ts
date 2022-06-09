import { Observable, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock, createNewEvent } from '@datadog/browser-core/test/specHelper'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { ClickChain } from './clickChain'
import { MAX_DISTANCE_BETWEEN_CLICKS, MAX_DURATION_BETWEEN_CLICKS, createClickChain, isRage } from './clickChain'
import type { Click } from './trackClickActions'

describe('createClickChain', () => {
  let clickChain: ClickChain | undefined
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clickChain?.stop()
    clock.cleanup()
  })

  it('creates a click chain', () => {
    clickChain = createClickChain(createFakeClick())
    expect(clickChain).toEqual({
      tryAppend: jasmine.any(Function),
      stop: jasmine.any(Function),
    })
  })

  it('appends a click', () => {
    clickChain = createClickChain(createFakeClick())
    expect(clickChain.tryAppend(createFakeClick())).toBe(true)
  })

  describe('finalize', () => {
    it('finalizes if we try to append a non-similar click', () => {
      const firstClick = createFakeClick({ target: document.documentElement })
      clickChain = createClickChain(firstClick)
      firstClick.stop()
      clickChain.tryAppend(createFakeClick({ target: document.body }))
      expect(firstClick.validate).toHaveBeenCalled()
    })

    it('does not finalize until it waited long enough to ensure no other click can be appended', () => {
      const firstClick = createFakeClick()
      clickChain = createClickChain(firstClick)
      firstClick.stop()
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(firstClick.validate).not.toHaveBeenCalled()
      clock.tick(1)
      expect(firstClick.validate).toHaveBeenCalled()
    })

    it('does not finalize until all clicks are stopped', () => {
      const firstClick = createFakeClick()
      clickChain = createClickChain(firstClick)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(firstClick.validate).not.toHaveBeenCalled()
      firstClick.stop()
      expect(firstClick.validate).toHaveBeenCalled()
    })

    it('finalizes when stopping the click chain', () => {
      const firstClick = createFakeClick({ target: document.documentElement })
      clickChain = createClickChain(firstClick)
      firstClick.stop()
      clickChain.stop()
      expect(firstClick.validate).toHaveBeenCalled()
    })
  })

  describe('clicks similarity', () => {
    it('does not accept a click if its timestamp is long after the previous one', () => {
      clickChain = createClickChain(createFakeClick())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(clickChain.tryAppend(createFakeClick())).toBe(false)
    })

    it('does not accept a click if its target is different', () => {
      clickChain = createClickChain(createFakeClick({ target: document.documentElement }))
      expect(clickChain.tryAppend(createFakeClick({ target: document.body }))).toBe(false)
    })

    it('does not accept a click if its location is far from the previous one', () => {
      clickChain = createClickChain(createFakeClick({ clientX: 100, clientY: 100 }))
      expect(
        clickChain.tryAppend(createFakeClick({ clientX: 100, clientY: 100 + MAX_DISTANCE_BETWEEN_CLICKS + 1 }))
      ).toBe(false)
    })

    it('considers clicks relative to the previous one', () => {
      clickChain = createClickChain(createFakeClick())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      clickChain.tryAppend(createFakeClick())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(clickChain.tryAppend(createFakeClick())).toBe(true)
    })
  })

  describe('when rage is detected', () => {
    it('discards individual clicks', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      createValidatedClickChain(clicks)
      clicks.forEach((click) => expect(click.discard).toHaveBeenCalled())
    })

    it('uses a clone of the first click to represent the rage click', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      createValidatedClickChain(clicks)
      expect(clicks[0].clonedClick).toBeTruthy()
      expect(clicks[0].clonedClick?.validate).toHaveBeenCalled()
    })

    it('the rage click should have a "rage" frustration', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      createValidatedClickChain(clicks)
      const expectedFrustrations = new Set()
      expectedFrustrations.add(FrustrationType.RAGE_CLICK)
      expect(clicks[0].clonedClick?.getFrustrations()).toEqual(expectedFrustrations)
    })

    it('the rage click should contains other clicks frustration', () => {
      const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
      clicks[1].addFrustration(FrustrationType.DEAD_CLICK)
      createValidatedClickChain(clicks)
      expect(clicks[0].clonedClick?.getFrustrations().has(FrustrationType.RAGE_CLICK)).toBe(true)
    })

    function createValidatedClickChain(clicks: Click[]) {
      clickChain = createClickChain(clicks[0])
      clicks.slice(1).forEach((click) => clickChain!.tryAppend(click))
      clicks.forEach((click) => click.stop())
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
    expect(isRage([createFakeClick(), createFakeClick(), createFakeClick()])).toBe(true)
  })

  it('does not consider as rage two clicks happening at the same time', () => {
    expect(isRage([createFakeClick(), createFakeClick()])).toBe(false)
  })

  it('does not consider as rage a first click long before two fast clicks', () => {
    const clicks = [createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick(), createFakeClick())

    expect(isRage(clicks)).toBe(false)
  })

  it('considers as rage a first click long before three fast clicks', () => {
    const clicks = [createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick(), createFakeClick(), createFakeClick())

    expect(isRage(clicks)).toBe(true)
  })

  it('considers as rage three fast clicks long before a last click', () => {
    const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick())

    expect(isRage(clicks)).toBe(true)
  })
})

function createFakeClick(eventPartial?: Partial<MouseEvent & { target: Element }>): Click & { clonedClick?: Click } {
  const stopObservable = new Observable<void>()
  let isStopped = false
  let clonedClick: Click | undefined
  const frustrations = new Set<FrustrationType>()
  return {
    event: createNewEvent('click', {
      element: document.body,
      clientX: 100,
      clientY: 100,
      timeStamp: timeStampNow(),
      target: document.body,
      ...eventPartial,
    }),
    stopObservable,
    isStopped: () => isStopped,
    stop: () => {
      isStopped = true
      stopObservable.notify()
    },
    clone: () => {
      clonedClick = createFakeClick(eventPartial)
      return clonedClick
    },
    discard: jasmine.createSpy(),
    validate: jasmine.createSpy(),
    addFrustration: (frustration) => frustrations.add(frustration),
    getFrustrations: () => frustrations,

    get clonedClick() {
      return clonedClick
    },
  }
}
