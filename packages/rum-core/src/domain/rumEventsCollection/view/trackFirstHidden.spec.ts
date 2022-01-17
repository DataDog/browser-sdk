import type { RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent, restorePageVisibility, setPageVisibility } from '../../../../../core/test/specHelper'
import { resetFirstHidden, trackFirstHidden } from './trackFirstHidden'

describe('trackFirstHidden', () => {
  afterEach(() => {
    resetFirstHidden()
    restorePageVisibility()
  })

  describe('the page is initially hidden', () => {
    it('should return 0', () => {
      setPageVisibility('hidden')
      expect(trackFirstHidden().timeStamp).toBe(0 as RelativeTime)
    })

    it('should ignore events', () => {
      setPageVisibility('hidden')
      const emitter = document.createElement('div')
      const firstHidden = trackFirstHidden(emitter)

      emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))
      emitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(0 as RelativeTime)
    })
  })

  describe('the page is initially visible', () => {
    it('should return Infinity if the page was not hidden yet', () => {
      expect(trackFirstHidden().timeStamp).toBe(Infinity as RelativeTime)
    })

    it('should return the timestamp of the first pagehide event', () => {
      const emitter = document.createElement('div')
      const firstHidden = trackFirstHidden(emitter)

      emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })

    it('should return the timestamp of the first visibilitychange event if the page is hidden', () => {
      const emitter = document.createElement('div')
      const firstHidden = trackFirstHidden(emitter)

      setPageVisibility('hidden')
      emitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })

    it('should ignore visibilitychange event if the page is visible', () => {
      const emitter = document.createElement('div')
      const firstHidden = trackFirstHidden(emitter)

      emitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(Infinity as RelativeTime)
    })

    it('should ignore subsequent events', () => {
      const emitter = document.createElement('div')
      const firstHidden = trackFirstHidden(emitter)

      emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

      // Subsequent events:
      emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 200 }))
      setPageVisibility('hidden')
      emitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 200 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })
  })
})
