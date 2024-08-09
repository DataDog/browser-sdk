import { addEventListener, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import { getScrollX, getScrollY } from './scroll'

describe('scroll', () => {
  let shouldWaitForWindowScrollEvent: boolean
  let configuration: RumConfiguration
  const addVerticalScrollBar = () => {
    document.body.style.setProperty('margin-bottom', '5000px')
  }

  beforeEach(() => {
    configuration = {} as RumConfiguration
    shouldWaitForWindowScrollEvent = false
  })

  afterEach((done) => {
    document.body.style.removeProperty('margin-bottom')
    window.scrollTo(0, 0)

    // Those tests are triggering asynchronous scroll events that might impact tests run after them.
    // To avoid that, we wait for the next scroll event before continuing to the next one.
    // Those events don't seem to be triggered consistently on safari though, so stop waiting after a while.
    if (shouldWaitForWindowScrollEvent) {
      const STOP_WAITING_FOR_SCROLL = 2000
      const { stop: removeScrollListener } = addEventListener(
        configuration,
        window,
        DOM_EVENT.SCROLL,
        () => {
          clearTimeout(timeout)
          done()
        },
        {
          passive: true,
          once: true,
          capture: true,
        }
      )
      const timeout = setTimeout(() => {
        removeScrollListener()
        done()
      }, STOP_WAITING_FOR_SCROLL)
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
