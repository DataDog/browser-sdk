import { waitAfterNextPaint } from 'packages/core/test'
import { getScrollX, getScrollY } from './scroll'

describe('scroll', () => {
  beforeEach(() => {
    document.body.style.setProperty('margin-bottom', '5000px')
  })

  afterEach(async () => {
    document.body.style.removeProperty('margin-bottom')
    window.scrollTo(0, 0)

    // Those tests are triggering asynchronous events (notably: window scroll and visualViewport
    // resize) that might impact tests run after them. To avoid that, we wait for the events before
    // continuing to the next test.
    await waitAfterNextPaint()
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

      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
  })
})
