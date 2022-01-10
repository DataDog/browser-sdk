import { getScrollX, getScrollY, getWindowHeight, getWindowWidth } from './viewports'

function isMobileSafari12() {
  return /iPhone OS 12.* like Mac OS.* Version\/12.* Mobile.*Safari/.test(navigator.userAgent)
}

function getCurrentScrollbarWidth() {
  const thickness = window.innerWidth - document.documentElement.clientWidth
  // eslint-disable-next-line no-console
  console.log('getCurrentScrollbarWidth:', thickness, window.innerWidth, document.documentElement.clientWidth)
  expect(thickness).toBeLessThanOrEqual(20)
  expect(thickness).toBeGreaterThanOrEqual(0)
  return thickness
}

function getCurrentScrollbarHeight() {
  const thickness = window.innerHeight - document.documentElement.clientHeight
  // eslint-disable-next-line no-console
  console.log('getCurrentScrollbarHeight:', thickness, window.innerHeight, document.documentElement.clientHeight)
  expect(thickness).toBeLessThanOrEqual(20)
  expect(thickness).toBeGreaterThanOrEqual(0)
  return thickness
}

describe('layout viewport', () => {
  const addVerticalScrollBar = () => {
    document.body.style.setProperty('margin-bottom', '2000px')
  }
  const addHorizontalScrollBar = () => {
    document.body.style.setProperty('margin-bottom', '2000px')
  }

  afterEach(() => {
    document.body.style.removeProperty('margin-bottom')
    document.body.style.removeProperty('margin-right')
    window.scrollTo(0, 0)
  })

  describe('get window width has similar native behaviour', () => {
    // innerWidth includes the thickness of the sidebar while `visualViewport.width` excludes it
    it('without scrollbars', () => {
      const initialInnerWidth = getWindowWidth()
      expect(initialInnerWidth).toBe(window.innerWidth)
    })

    it('with scrollbars', () => {
      addHorizontalScrollBar()
      const initialInnerWidth = getWindowWidth()
      expect(initialInnerWidth).toBe(window.innerWidth - getCurrentScrollbarWidth())
    })
  })

  describe('get window height has similar native behaviour', () => {
    // innerHeight includes the thickness of the sidebar while `visualViewport.height` excludes it
    it('without scrollbars', () => {
      const initialInnerHeight = getWindowHeight()
      expect(initialInnerHeight).toBe(window.innerHeight)
    })
    it('with scrollbars', () => {
      addVerticalScrollBar()
      const initialInnerHeight = getWindowHeight()
      expect(initialInnerHeight).toBe(window.innerHeight - getCurrentScrollbarHeight())
    })
  })

  describe('getScrollX/Y', () => {
    it('normalized scroll matches initial behaviour', () => {
      addVerticalScrollBar()
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
      addVerticalScrollBar()
      const SCROLL_DOWN_PX = 100
      window.scrollTo(0, SCROLL_DOWN_PX)
      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
  })
})
