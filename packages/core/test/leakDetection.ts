import { display } from '../src/tools/display'
import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'

let originalAddEventListener: typeof EventTarget.prototype.addEventListener
let originalRemoveEventListener: typeof EventTarget.prototype.removeEventListener
let wrappedListeners: {
  [key: string]: Map<EventListenerOrEventListenerObject | null, EventListenerOrEventListenerObject | null>
}

export function startLeakDetection() {
  wrappedListeners = {}

  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalAddEventListener = EventTarget.prototype.addEventListener
  // eslint-disable-next-line @typescript-eslint/unbound-method
  originalRemoveEventListener = EventTarget.prototype.removeEventListener

  EventTarget.prototype.addEventListener = function (event, listener, options) {
    if (!wrappedListeners[event]) {
      wrappedListeners[event] = new Map()
    }
    const wrappedListener = withLeakDetection(event, listener as EventListener)
    wrappedListeners[event].set(listener, wrappedListener)
    return originalAddEventListener.call(this, event, wrappedListener, options)
  }
  EventTarget.prototype.removeEventListener = function (event, listener, options) {
    const wrappedListener = wrappedListeners[event]?.get(listener)
    wrappedListeners[event]?.delete(listener)
    return originalRemoveEventListener.call(this, event, wrappedListener || listener, options)
  }
}

export function stopLeakDetection() {
  EventTarget.prototype.addEventListener = originalAddEventListener
  EventTarget.prototype.removeEventListener = originalRemoveEventListener
  wrappedListeners = {}
}

function withLeakDetection(eventName: string, listener: EventListener) {
  const specWhenAdded = getCurrentJasmineSpec()!.fullName
  return (event: Event) => {
    const currentSpec = getCurrentJasmineSpec()!.fullName
    if (specWhenAdded !== currentSpec) {
      display.error(`Leaked listener
  event names: "${eventName}"
  attached with: "${specWhenAdded}"        
  executed with: "${currentSpec}"`)
    }
    listener(event)
  }
}
