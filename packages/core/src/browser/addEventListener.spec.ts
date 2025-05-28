import type { Configuration } from '../domain/configuration'
import { createNewEvent, mockZoneJs, registerCleanupTask } from '../../test'
import type { MockZoneJs } from '../../test'
import { noop } from '../tools/utils/functionUtils'
import { addEventListener, DOM_EVENT } from './addEventListener'

describe('addEventListener', () => {
  let configuration: Configuration

  describe('Zone.js support', () => {
    let zoneJs: MockZoneJs

    beforeEach(() => {
      configuration = { allowUntrustedEvents: false } as Configuration
      zoneJs = mockZoneJs()
    })

    it('uses the original addEventListener method instead of the method patched by Zone.js', () => {
      const zoneJsPatchedAddEventListener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      zoneJs.replaceProperty(eventTarget, 'addEventListener', zoneJsPatchedAddEventListener)

      addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, noop)
      expect(zoneJsPatchedAddEventListener).not.toHaveBeenCalled()
    })

    it('uses the original removeEventListener method instead of the method patched by Zone.js', () => {
      const zoneJsPatchedRemoveEventListener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      zoneJs.replaceProperty(eventTarget, 'removeEventListener', zoneJsPatchedRemoveEventListener)

      const { stop } = addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, noop)
      stop()
      expect(zoneJsPatchedRemoveEventListener).not.toHaveBeenCalled()
    })
  })

  it('Use the EventTarget.prototype.addEventListener when the eventTarget is an instance of EventTarget', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalAddEventListener = EventTarget.prototype.addEventListener
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener

    EventTarget.prototype.addEventListener = jasmine.createSpy()
    EventTarget.prototype.removeEventListener = jasmine.createSpy()

    registerCleanupTask(() => {
      EventTarget.prototype.addEventListener = originalAddEventListener
      EventTarget.prototype.removeEventListener = originalRemoveEventListener
    })

    const htmlDivElement = document.createElement('div')
    htmlDivElement.addEventListener = jasmine.createSpy()
    htmlDivElement.removeEventListener = jasmine.createSpy()

    const { stop } = addEventListener({ allowUntrustedEvents: false }, htmlDivElement, DOM_EVENT.CLICK, noop)

    const event = createNewEvent(DOM_EVENT.CLICK)
    htmlDivElement.dispatchEvent(event)
    stop()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(htmlDivElement.addEventListener).not.toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(htmlDivElement.removeEventListener).not.toHaveBeenCalled()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(EventTarget.prototype.addEventListener).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(EventTarget.prototype.removeEventListener).toHaveBeenCalled()
  })

  it('Use the addEventListener method when the eventTarget is not an instance of EventTarget', () => {
    const listener = jasmine.createSpy()

    const customEventTarget = {
      addEventListener: jasmine.createSpy(),
      removeEventListener: jasmine.createSpy(),
    } as unknown as HTMLElement

    const { stop } = addEventListener({ allowUntrustedEvents: false }, customEventTarget, 'change', listener)
    stop()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(customEventTarget.addEventListener).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(customEventTarget.removeEventListener).toHaveBeenCalled()
  })

  describe('Untrusted event', () => {
    beforeEach(() => {
      configuration = { allowUntrustedEvents: false } as Configuration
    })

    it('should be ignored if __ddIsTrusted is absent', () => {
      const listener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, listener)

      const event = createNewEvent(DOM_EVENT.CLICK, { __ddIsTrusted: undefined })
      eventTarget.dispatchEvent(event)
      expect(listener).not.toHaveBeenCalled()
    })

    it('should be ignored if __ddIsTrusted is false', () => {
      const listener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, listener)

      const event = createNewEvent(DOM_EVENT.CLICK, { __ddIsTrusted: false })
      eventTarget.dispatchEvent(event)
      expect(listener).not.toHaveBeenCalled()
    })

    it('should not be ignored if __ddIsTrusted is true', () => {
      const listener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, listener)

      const event = createNewEvent(DOM_EVENT.CLICK, { __ddIsTrusted: true })
      eventTarget.dispatchEvent(event)

      expect(listener).toHaveBeenCalled()
    })

    it('should not be ignored if allowUntrustedEvents is true', () => {
      const listener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      configuration = { allowUntrustedEvents: true } as Configuration

      addEventListener(configuration, eventTarget, DOM_EVENT.CLICK, listener)

      const event = createNewEvent(DOM_EVENT.CLICK, { __ddIsTrusted: undefined })
      eventTarget.dispatchEvent(event)

      expect(listener).toHaveBeenCalled()
    })
  })
})
