import { noop, timeStampNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock, createNewEvent } from '@datadog/browser-core/test/specHelper'
import type { RageClickChain } from './rageClickChain'
import { MAX_DISTANCE_BETWEEN_CLICKS, MAX_DURATION_BETWEEN_CLICKS, createRageClickChain } from './rageClickChain'
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
})

function createFakePotentialAction(eventPartial?: Partial<MouseEvent>): PotentialAction {
  let onStopCallback = noop
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
    discard: jasmine.createSpy(),
    validate: jasmine.createSpy(),
    addFrustration: noop,
  }
}
