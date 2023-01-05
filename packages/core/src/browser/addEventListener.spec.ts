import { createNewEvent } from '../../test/specHelper'
import { stubZoneJs } from '../../test/stubZoneJs'
import type { RawTelemetryEvent } from '../domain/telemetry'
import { resetTelemetry, startFakeTelemetry } from '../domain/telemetry'
import { noop } from '../tools/utils'

import { addEventListener, DOM_EVENT, resetUntrustedEventsCount } from './addEventListener'

describe('addEventListener', () => {
  describe('untrusted events reporting', () => {
    let originalJasmine: typeof jasmine
    let telemetryEvents: RawTelemetryEvent[]
    let eventTarget: EventTarget

    beforeEach(() => {
      eventTarget = document.createElement('div')
      originalJasmine = window.jasmine
      delete (window as any).jasmine
      telemetryEvents = startFakeTelemetry()
    })

    afterEach(() => {
      window.jasmine = originalJasmine
      resetTelemetry()
      resetUntrustedEventsCount()
    })

    it('sends a telemetry debug log when an untrusted event is dispatched', () => {
      addEventListener(eventTarget, DOM_EVENT.CLICK, noop)
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      expect(telemetryEvents).toEqual([
        {
          message: 'Untrusted event',
          status: 'debug',
          type: 'log',
          event_type: 'click',
        },
      ])
    })

    it('only reports the first untrusted event of each type', () => {
      addEventListener(eventTarget, DOM_EVENT.CLICK, noop)
      addEventListener(eventTarget, DOM_EVENT.MOUSE_UP, noop)

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))

      eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.MOUSE_UP))

      expect(telemetryEvents.length).toBe(2)
    })
  })

  describe('Zone.js support', () => {
    let zoneJsStub: ReturnType<typeof stubZoneJs>

    beforeEach(() => {
      zoneJsStub = stubZoneJs()
    })

    afterEach(() => {
      zoneJsStub.restore()
    })

    it('uses the original addEventListener method instead of the method patched by Zone.js', () => {
      const zoneJsPatchedAddEventListener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      zoneJsStub.replaceProperty(eventTarget, 'addEventListener', zoneJsPatchedAddEventListener)

      addEventListener(eventTarget, DOM_EVENT.CLICK, noop)
      expect(zoneJsPatchedAddEventListener).not.toHaveBeenCalled()
    })

    it('uses the original removeEventListener method instead of the method patched by Zone.js', () => {
      const zoneJsPatchedRemoveEventListener = jasmine.createSpy()
      const eventTarget = document.createElement('div')
      zoneJsStub.replaceProperty(eventTarget, 'removeEventListener', zoneJsPatchedRemoveEventListener)

      const { stop } = addEventListener(eventTarget, DOM_EVENT.CLICK, noop)
      stop()
      expect(zoneJsPatchedRemoveEventListener).not.toHaveBeenCalled()
    })
  })
})
