import { DOM_EVENT } from '@datadog/browser-core'
import { getScrollX, getScrollY } from './scroll'

describe('scroll', () => {
  let testDidScroll: boolean

  beforeEach(() => {
    document.body.style.setProperty('margin-bottom', '5000px')
    testDidScroll = false
  })

  afterEach(async () => {
    document.body.style.removeProperty('margin-bottom')
    window.scrollTo(0, 0)

    // Those tests are triggering asynchronous events that might impact tests run after them. To
    // avoid that, we wait for the events before continuing to the next test.
    await Promise.all([
      window.visualViewport &&
        waitForEvents(
          window.visualViewport,
          DOM_EVENT.RESIZE,
          2 // We add then remove the scrollbar, so the resize event is triggered twice
        ),
      testDidScroll && waitForEvents(window, DOM_EVENT.SCROLL, 1),
    ])
  })

  describe('getScrollX/Y', () => {
    it('normalized scroll matches initial behavior', () => {
      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(0)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })

    it('normalized scroll updates when scrolled', () => {
      const SCROLL_DOWN_PX = 100

      window.scrollTo(0, SCROLL_DOWN_PX)
      testDidScroll = true

      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
  })
})

function waitForEvents(target: EventTarget, eventName: string, count: number) {
  return new Promise<void>((resolve) => {
    let counter = 0

    function listener() {
      counter++
      if (counter === count) {
        done()
      }
    }

    function done() {
      target.removeEventListener(eventName, listener)
      resolve()
    }

    target.addEventListener(eventName, listener)

    // In some cases, events are not triggered consistently. This have been observed in Safari. To
    // avoid waiting forever, we use a timeout.
    setTimeout(done, 1000)
  })
}
