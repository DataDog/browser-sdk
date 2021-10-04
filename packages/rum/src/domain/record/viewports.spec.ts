import { isSafari } from 'packages/core/test/specHelper'
import { getScrollX, getScrollY, getWindowWidth, getWindowHeight } from './viewports'

describe('layout viewport', () => {
  beforeEach(() => {
    document.body.style.setProperty('margin-bottom', '2000px')
  })

  afterEach(() => {
    document.body.style.removeProperty('margin-bottom')
  })

  describe('get window width and height', () => {
    it('normalized scroll matches native behaviour', () => {
      const initialInnerWidth = getWindowWidth()
      const initialInnerHeight = getWindowHeight()
      expect(initialInnerWidth).toBe(window.innerWidth)
      expect(initialInnerHeight).toBe(window.innerHeight)
    })
  })

  describe('getScrollX/Y', () => {
    it('normalized scroll matches native behaviour', () => {
      const SCROLL_DOWN_PX = 100
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)

      if (!isSafari) {
        // Mobile Safari 12.0 (iOS 12.1) not responding to native scroll
        window.scrollTo(0, SCROLL_DOWN_PX)
        expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
        expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
      }
    })
    it('normalized scroll updates when scrolled', () => {
      const SCROLL_DOWN_PX = 100
      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(0)

      if (!isSafari) {
        // Mobile Safari 12.0 (iOS 12.1) not responding to native scroll
        window.scrollTo(0, SCROLL_DOWN_PX)
        expect(getScrollX()).toBe(0)
        expect(getScrollY()).toBe(100)
      }
    })
  })
})
