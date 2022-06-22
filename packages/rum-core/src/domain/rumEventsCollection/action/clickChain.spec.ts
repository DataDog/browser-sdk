import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock } from '@datadog/browser-core/test/specHelper'
import { createFakeClick } from '../../../../test/createFakeClick'
import type { ClickChain } from './clickChain'
import { MAX_DISTANCE_BETWEEN_CLICKS, MAX_DURATION_BETWEEN_CLICKS, createClickChain } from './clickChain'

describe('createClickChain', () => {
  let clickChain: ClickChain | undefined
  let clock: Clock
  let onFinalizeSpy: jasmine.Spy

  beforeEach(() => {
    clock = mockClock()
    onFinalizeSpy = jasmine.createSpy('onFinalize')
  })

  afterEach(() => {
    clickChain?.stop()
    clock.cleanup()
  })

  it('creates a click chain', () => {
    clickChain = createClickChain(createFakeClick(), onFinalizeSpy)
    expect(clickChain).toEqual({
      tryAppend: jasmine.any(Function),
      stop: jasmine.any(Function),
    })
  })

  it('appends a click', () => {
    clickChain = createClickChain(createFakeClick(), onFinalizeSpy)
    expect(clickChain.tryAppend(createFakeClick())).toBe(true)
  })

  describe('finalize', () => {
    it('finalizes if we try to append a non-similar click', () => {
      const firstClick = createFakeClick({ event: { target: document.documentElement } })
      clickChain = createClickChain(firstClick, onFinalizeSpy)
      firstClick.stop()
      clickChain.tryAppend(createFakeClick({ event: { target: document.body } }))
      expect(onFinalizeSpy).toHaveBeenCalled()
    })

    it('does not finalize until it waited long enough to ensure no other click can be appended', () => {
      const firstClick = createFakeClick()
      clickChain = createClickChain(firstClick, onFinalizeSpy)
      firstClick.stop()
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(onFinalizeSpy).not.toHaveBeenCalled()
      clock.tick(1)
      expect(onFinalizeSpy).toHaveBeenCalled()
    })

    it('does not finalize until all clicks are stopped', () => {
      const firstClick = createFakeClick()
      clickChain = createClickChain(firstClick, onFinalizeSpy)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(onFinalizeSpy).not.toHaveBeenCalled()
      firstClick.stop()
      expect(onFinalizeSpy).toHaveBeenCalled()
    })

    it('finalizes when stopping the click chain', () => {
      const firstClick = createFakeClick()
      clickChain = createClickChain(firstClick, onFinalizeSpy)
      firstClick.stop()
      clickChain.stop()
      expect(onFinalizeSpy).toHaveBeenCalled()
    })
  })

  describe('clicks similarity', () => {
    it('does not accept a click if its timestamp is long after the previous one', () => {
      clickChain = createClickChain(createFakeClick(), onFinalizeSpy)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS)
      expect(clickChain.tryAppend(createFakeClick())).toBe(false)
    })

    it('does not accept a click if its target is different', () => {
      clickChain = createClickChain(createFakeClick({ event: { target: document.documentElement } }), onFinalizeSpy)
      expect(clickChain.tryAppend(createFakeClick({ event: { target: document.body } }))).toBe(false)
    })

    it('does not accept a click if its location is far from the previous one', () => {
      clickChain = createClickChain(createFakeClick({ event: { clientX: 100, clientY: 100 } }), onFinalizeSpy)
      expect(
        clickChain.tryAppend(
          createFakeClick({ event: { clientX: 100, clientY: 100 + MAX_DISTANCE_BETWEEN_CLICKS + 1 } })
        )
      ).toBe(false)
    })

    it('considers clicks relative to the previous one', () => {
      clickChain = createClickChain(createFakeClick(), onFinalizeSpy)
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      clickChain.tryAppend(createFakeClick())
      clock.tick(MAX_DURATION_BETWEEN_CLICKS - 1)
      expect(clickChain.tryAppend(createFakeClick())).toBe(true)
    })
  })
})
