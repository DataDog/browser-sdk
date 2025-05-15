import type { RelativeTime } from '@flashcatcloud/browser-core'
import { DOM_EVENT } from '@flashcatcloud/browser-core'
import { createNewEvent, restorePageVisibility, setPageVisibility } from '@flashcatcloud/browser-core/test'
import { mockRumConfiguration } from '../../../../test'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackFirstHidden', () => {
  const configuration = mockRumConfiguration()
  let firstHidden: { timeStamp: RelativeTime; stop: () => void }

  afterEach(() => {
    restorePageVisibility()
    firstHidden.stop()
  })

  describe('the page is initially hidden', () => {
    it('should return 0', () => {
      setPageVisibility('hidden')
      firstHidden = trackFirstHidden(configuration)

      expect(firstHidden.timeStamp).toBe(0 as RelativeTime)
    })

    it('should ignore events', () => {
      setPageVisibility('hidden')
      const eventTarget = createWindowEventTarget()
      firstHidden = trackFirstHidden(configuration, eventTarget)

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(0 as RelativeTime)
    })
  })

  describe('the page is initially visible', () => {
    it('should return Infinity if the page was not hidden yet', () => {
      firstHidden = trackFirstHidden(configuration)
      expect(firstHidden.timeStamp).toBe(Infinity as RelativeTime)
    })

    it('should return the timestamp of the first pagehide event', () => {
      const eventTarget = createWindowEventTarget()
      firstHidden = trackFirstHidden(configuration, eventTarget)

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })

    it('should return the timestamp of the first visibilitychange event if the page is hidden', () => {
      const eventTarget = createWindowEventTarget()
      firstHidden = trackFirstHidden(configuration, eventTarget)

      setPageVisibility('hidden')
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })

    it('should ignore visibilitychange event if the page is visible', () => {
      const eventTarget = createWindowEventTarget()
      firstHidden = trackFirstHidden(configuration, eventTarget)

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 100 }))

      expect(firstHidden.timeStamp).toBe(Infinity as RelativeTime)
    })

    it('should ignore subsequent events', () => {
      const eventTarget = createWindowEventTarget()
      firstHidden = trackFirstHidden(configuration, eventTarget)

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

      // Subsequent events:
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 200 }))
      setPageVisibility('hidden')
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE, { timeStamp: 200 }))

      expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
    })
  })

  function createWindowEventTarget() {
    return document.createElement('div') as unknown as Window
  }
})
