import type { MouseEventOnElement } from '@datadog/browser-rum-core'
import type { TrustableEvent } from '../../src'
import { objectEntries } from '../../src'

export function createNewEvent(eventName: 'click', properties?: Partial<MouseEvent>, trusted?: boolean): MouseEvent
export function createNewEvent(
  eventName: 'pointerup',
  properties?: Partial<PointerEvent>,
  trusted?: boolean
): MouseEventOnElement
export function createNewEvent(
  eventName: 'message',
  properties?: Partial<MessageEvent>,
  trusted?: boolean
): MessageEvent
export function createNewEvent(
  eventName: 'securitypolicyviolation',
  properties?: Partial<SecurityPolicyViolationEvent>,
  trusted?: boolean
): SecurityPolicyViolationEvent
export function createNewEvent(eventName: string, properties?: { [name: string]: unknown }, trusted?: boolean): Event
export function createNewEvent(
  eventName: string,
  properties: { [name: string]: unknown } = {},
  trusted: boolean = true
) {
  let event: TrustableEvent
  if (typeof Event === 'function') {
    event = new Event(eventName)
  } else {
    event = document.createEvent('Event')
    event.initEvent(eventName, true, true)
  }
  event.__ddIsTrusted = trusted
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
