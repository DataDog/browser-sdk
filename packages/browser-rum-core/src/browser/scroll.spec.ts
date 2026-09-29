import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { waitAfterNextPaint } from '@datadog/browser-core/test'
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
      expect(getScrollX()).toBe(Math.round(window.scrollX || window.pageXOffset))
      expect(getScrollY()).toBe(Math.round(window.scrollY || window.pageYOffset))
    })

    it('normalized scroll updates when scrolled', (ctx) => {
      ctx.skip(
        navigator.userAgent.includes('Firefox'),
        'Firefox on BrowserStack returns subpixel scroll values (e.g. 99.95 instead of 100)'
      )

      const SCROLL_DOWN_PX = 100

      window.scrollTo(0, SCROLL_DOWN_PX)

      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(Math.round(window.scrollX || window.pageXOffset))
      expect(getScrollY()).toBe(Math.round(window.scrollY || window.pageYOffset))
    })
  })
})
