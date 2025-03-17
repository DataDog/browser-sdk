import type { MouseEventOnElement } from '@flashcatcloud/browser-rum-core'
import type { TrustableEvent } from '../../src'
import { objectEntries } from '../../src'

export function createNewEvent(eventName: 'click', properties?: Partial<MouseEvent>): MouseEvent
export function createNewEvent(eventName: 'pointerup', properties?: Partial<PointerEvent>): MouseEventOnElement
export function createNewEvent(eventName: 'message', properties?: Partial<MessageEvent>): MessageEvent
export function createNewEvent(
  eventName: 'securitypolicyviolation',
  properties?: Partial<SecurityPolicyViolationEvent>
): SecurityPolicyViolationEvent
export function createNewEvent(eventName: string, properties?: { [name: string]: unknown }): Event
export function createNewEvent(eventName: string, properties: { [name: string]: unknown } = {}) {
  let event: TrustableEvent
  if (typeof Event === 'function') {
    event = new Event(eventName)
  } else {
    event = document.createEvent('Event')
    event.initEvent(eventName, true, true)
  }
  event.__ddIsTrusted = true
  objectEntries(properties).forEach(([name, value]) => {
    // Setting values directly or with a `value` descriptor seems unsupported in IE11
    Object.defineProperty(event, name, {
      get() {
        return value
      },
    })
  })
  return event
}
