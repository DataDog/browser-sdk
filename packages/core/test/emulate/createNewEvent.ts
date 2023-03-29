import { objectEntries } from '../../src'

export function createNewEvent<P extends Record<string, unknown>>(eventName: 'click', properties?: P): MouseEvent & P
export function createNewEvent<P extends Record<string, unknown>>(
  eventName: 'pointerup',
  properties?: P
): PointerEvent & P
export function createNewEvent(eventName: string, properties?: { [name: string]: unknown }): Event
export function createNewEvent(eventName: string, properties: { [name: string]: unknown } = {}) {
  let event: Event
  if (typeof Event === 'function') {
    event = new Event(eventName)
  } else {
    event = document.createEvent('Event')
    event.initEvent(eventName, true, true)
  }
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
