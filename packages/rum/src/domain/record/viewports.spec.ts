import { getScrollX, getScrollY, getWindowWidth, getWindowHeight } from './viewports'

function isMobileSafari12() {
  return /iPhone OS 12.* like Mac OS.* Version\/12.* Mobile.*Safari/.test(navigator.userAgent)
}

describe('layout viewport', () => {
  beforeEach(() => {
    document.body.style.setProperty('margin-bottom', '2000px')
  })

  afterEach(() => {
    document.body.style.removeProperty('margin-bottom')
    window.scrollTo(0, 0)
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
    it('normalized scroll matches initial behaviour', () => {
      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(0)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
    it('normalized scroll updates when scrolled', () => {
      if (isMobileSafari12()) {
        // Mobile Safari 12 doesn't support scrollTo() within an iframe
        // Karma is evaluating some tests in an iframe
        // https://coderwall.com/p/c-aqqw/scrollable-iframe-on-mobile-safari
        pending('Mobile Safari 12 not supported')
      }
      const SCROLL_DOWN_PX = 100
      window.scrollTo(0, SCROLL_DOWN_PX)
      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
  })
})
