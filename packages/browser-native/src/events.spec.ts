import type { BrowserWindowWithZoneJs } from './getZoneJsOriginalValue'
import { addEventListener, removeEventListener } from './events'

describe('addEventListener', () => {
  it('adds an event listener to the target', () => {
    const target = document.createElement('div')
    const listener = jasmine.createSpy('listener')

    addEventListener(target, 'click', listener)
    target.dispatchEvent(new Event('click'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  describe('Zone.js bypass', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalAddEventListener = EventTarget.prototype.addEventListener

    beforeEach(() => {
      ;(window as BrowserWindowWithZoneJs).Zone = {
        __symbol__: (name: string) => `__zone_symbol__${name}`,
      }
    })

    afterEach(() => {
      EventTarget.prototype.addEventListener = originalAddEventListener
      delete (window as BrowserWindowWithZoneJs).Zone
      delete (EventTarget.prototype as any).__zone_symbol__addEventListener
    })

    it('uses the Zone.js original addEventListener instead of the patched one', () => {
      const target = document.createElement('div')
      const listener = jasmine.createSpy('listener')

      // Simulate Zone.js: patch the prototype and store original under the symbol key.
      // We use direct assignment instead of spyOn to avoid breaking Karma's event tracking.
      const patchedAddEventListener = jasmine.createSpy('patched addEventListener')
      const zoneOriginalAddEventListener = jasmine.createSpy('zoneOriginalAddEventListener')

      EventTarget.prototype.addEventListener = patchedAddEventListener as any
      ;(EventTarget.prototype as any).__zone_symbol__addEventListener = zoneOriginalAddEventListener

      addEventListener(target, 'click', listener)

      expect(zoneOriginalAddEventListener).toHaveBeenCalled()
      expect(patchedAddEventListener).not.toHaveBeenCalled()
    })
  })
})

describe('removeEventListener', () => {
  it('removes a previously added listener', () => {
    const target = document.createElement('div')
    const listener = jasmine.createSpy('listener')

    addEventListener(target, 'click', listener)
    removeEventListener(target, 'click', listener)
    target.dispatchEvent(new Event('click'))

    expect(listener).not.toHaveBeenCalled()
  })

  describe('Zone.js bypass', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener

    beforeEach(() => {
      ;(window as BrowserWindowWithZoneJs).Zone = {
        __symbol__: (name: string) => `__zone_symbol__${name}`,
      }
    })

    afterEach(() => {
      EventTarget.prototype.removeEventListener = originalRemoveEventListener
      delete (window as BrowserWindowWithZoneJs).Zone
      delete (EventTarget.prototype as any).__zone_symbol__removeEventListener
    })

    it('uses the Zone.js original removeEventListener instead of the patched one', () => {
      const target = document.createElement('div')
      const listener = jasmine.createSpy('listener')

      // Simulate Zone.js: patch the prototype and store original under the symbol key.
      // We use direct assignment instead of spyOn to avoid breaking Karma's event tracking.
      const patchedRemoveEventListener = jasmine.createSpy('patched removeEventListener')
      const zoneOriginalRemoveEventListener = jasmine.createSpy('zoneOriginalRemoveEventListener')

      EventTarget.prototype.removeEventListener = patchedRemoveEventListener as any
      ;(EventTarget.prototype as any).__zone_symbol__removeEventListener = zoneOriginalRemoveEventListener

      removeEventListener(target, 'click', listener)

      expect(zoneOriginalRemoveEventListener).toHaveBeenCalled()
      expect(patchedRemoveEventListener).not.toHaveBeenCalled()
    })
  })
})
