import { Observable, timeStampNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock, createNewEvent } from '@datadog/browser-core/test/specHelper'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { ClickChain } from './clickChain'
import { MAX_DISTANCE_BETWEEN_CLICKS, MAX_DURATION_BETWEEN_CLICKS, createClickChain } from './clickChain'
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
      expect(clicks[0].clonedClick?.addFrustration).toHaveBeenCalledWith(FrustrationType.RAGE_CLICK)
    })

    function createValidatedClickChain(clicks: Click[]) {
      clickChain = createClickChain(clicks[0])
      clicks.slice(1).forEach((click) => clickChain!.tryAppend(click))
      clicks.forEach((click) => click.stop())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
    }
  })
})

function createFakeClick(eventPartial?: Partial<MouseEvent & { target: Element }>): Click & { clonedClick?: Click } {
  const stopObservable = new Observable<void>()
  let isStopped = false
  let clonedClick: Click | undefined
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

    get clonedClick() {
      return clonedClick
    },
    hasError: false,
    hasActivity: true,
    hasSelectionChanged: false,
    addFrustration: jasmine.createSpy(),
  }
}
