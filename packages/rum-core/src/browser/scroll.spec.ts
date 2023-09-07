import { addEventListener, DOM_EVENT, isIE } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import { getScrollX, getScrollY } from './scroll'

function isMobileSafari12() {
  return /iPhone OS 12.* like Mac OS.* Version\/12.* Mobile.*Safari/.test(navigator.userAgent)
}

describe('scroll', () => {
  let shouldWaitForWindowScrollEvent: boolean
  let configuration: RumConfiguration
  const addVerticalScrollBar = () => {
    document.body.style.setProperty('margin-bottom', '5000px')
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = {} as RumConfiguration
    shouldWaitForWindowScrollEvent = false
  })

  afterEach((done) => {
    document.body.style.removeProperty('margin-bottom')
    window.scrollTo(0, 0)

    // Those tests are triggering asynchronous scroll events that might impact tests run after them.
    // To avoid that, we wait for the next scroll event before continuing to the next one.
    if (shouldWaitForWindowScrollEvent) {
      addEventListener(configuration, window, DOM_EVENT.SCROLL, () => done(), {
        passive: true,
        once: true,
        capture: true,
      })
    } else {
      done()
    }
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
      shouldWaitForWindowScrollEvent = true

      expect(getScrollX()).toBe(0)
      expect(getScrollY()).toBe(100)
      expect(getScrollX()).toBe(window.scrollX || window.pageXOffset)
      expect(getScrollY()).toBe(window.scrollY || window.pageYOffset)
    })
  })
})
