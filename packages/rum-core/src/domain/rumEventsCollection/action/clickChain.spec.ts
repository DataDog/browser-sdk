import { timeStampNow } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { mockClock, createNewEvent } from '../../../../../core/test/specHelper'
import type { BaseClick, ClickChain } from './clickChain'
import {
  CLICK_CHAIN_WINDOW_SIZE,
  CLICK_CHAIN_MAX_DISTANCE_WINDOW,
  CLICK_CHAIN_MAX_DURATION_WINDOW,
  createClickChain,
} from './clickChain'

describe('createClickChain', () => {
  let clickChain: ClickChain<BaseClick>
  let flushSpy: jasmine.Spy<(clicks: BaseClick[]) => void>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    flushSpy = jasmine.createSpy()
    clickChain = createClickChain(flushSpy)
  })

  afterEach(() => {
    clickChain.stop()
    clock.cleanup()
  })

  it('creates a click chain', () => {
    expect(clickChain).toEqual({
      tryAppend: jasmine.any(Function),
      stop: jasmine.any(Function),
    })
  })

  it('appends a click', () => {
    expect(clickChain.tryAppend(createClick())).toEqual({ markAsComplete: jasmine.any(Function) })
  })

  describe('flush', () => {
    it('flushes if we try to append a non-similar click', () => {
      clickChain.tryAppend(createClick({ target: document.documentElement }))!.markAsComplete()
      clickChain.tryAppend(createClick({ target: document.body }))
      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not flush until it waited long enough to ensure no other click can be appended', () => {
      clickChain.tryAppend(createClick())!.markAsComplete()
      clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW - 1)
      expect(flushSpy).not.toHaveBeenCalled()
      clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW)
      expect(flushSpy).toHaveBeenCalled()
    })

    it('does not flush until all clicks are marked as complete', () => {
      const clickReference = clickChain.tryAppend(createClick())
      clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW)
      expect(flushSpy).not.toHaveBeenCalled()
      clickReference!.markAsComplete()
      expect(flushSpy).toHaveBeenCalled()
    })

    it('ignores if a click is marked as complete more than once', () => {
      const clickReference1 = clickChain.tryAppend(createClick())!
      const clickReference2 = clickChain.tryAppend(createClick())!
      clickReference1.markAsComplete()
      clickReference1.markAsComplete()
      clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW)
      expect(flushSpy).not.toHaveBeenCalled()
      clickReference2.markAsComplete()
      expect(flushSpy).toHaveBeenCalled()
    })
  })

  describe('clicks similarity', () => {
    it('does not accept a click if its timestamp is long after a previous click', () => {
      clickChain.tryAppend(createClick())
      clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW)
      expect(clickChain.tryAppend(createClick())).toBe(null)
    })

    it('considers clicks in a sliding window', () => {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const timeAfterMaxDuration = timeStampNow() + CLICK_CHAIN_MAX_DURATION_WINDOW * 3

      while (timeStampNow() < timeAfterMaxDuration) {
        clickChain.tryAppend(createClick())
        clock.tick(CLICK_CHAIN_MAX_DURATION_WINDOW / CLICK_CHAIN_WINDOW_SIZE)
      }
      expect(clickChain.tryAppend(createClick())).toBeTruthy()
    })

    it('does not accept a click if its target is different', () => {
      clickChain.tryAppend(createClick({ target: document.documentElement }))
      expect(clickChain.tryAppend(createClick({ target: document.body }))).toBe(null)
    })

    it('does not accept a click if its location is far from a previous click', () => {
      clickChain.tryAppend(createClick({ clientX: 100, clientY: 100 }))
      expect(clickChain.tryAppend(createClick({ clientX: 100, clientY: 100 + CLICK_CHAIN_MAX_DISTANCE_WINDOW }))).toBe(
        null
      )
    })
  })
})

function createClick(eventPartial?: Partial<BaseClick['event']>) {
  return {
    event: createNewEvent('click', { element: document.body, clientX: 100, clientY: 100, ...eventPartial }),
    timeStamp: timeStampNow(),
  }
}
