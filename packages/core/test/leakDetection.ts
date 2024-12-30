import { display } from '../src/tools/display'
import { isIE } from '../src/tools/utils/browserDetection'
import { getCurrentJasmineSpec } from './getCurrentJasmineSpec'
import { registerCleanupTask } from './registerCleanupTask'

export function startLeakDetection() {
  if (isIE()) {
    return
  }

  let wrappedListeners: {
    [key: string]: Map<EventListenerOrEventListenerObject | null, EventListenerOrEventListenerObject | null>
  } = {}

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAddEventListener = EventTarget.prototype.addEventListener
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener

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

  registerCleanupTask(() => {
    EventTarget.prototype.addEventListener = originalAddEventListener
    EventTarget.prototype.removeEventListener = originalRemoveEventListener
    wrappedListeners = {}
  })
}

export function stopLeakDetection() {
  if (isIE()) {
    return
  }
}

function withLeakDetection(eventName: string, listener: EventListener) {
  const specWhenAdded = getCurrentJasmineSpec()
  const stackWhenAdded = new Error().stack
  if (
    !specWhenAdded ||
    // Ignore listeners added by React: React is adding listeners to DOM elements for synthetic events, and there is no way to remove them
    stackWhenAdded?.includes('listenToAllSupportedEvents')
  ) {
    return listener
  }

  return (event: Event) => {
    const currentSpec = getCurrentJasmineSpec()
    if (!currentSpec || specWhenAdded.fullName !== currentSpec.fullName) {
      display.error(`Leaked listener
  event names: "${eventName}"
  attached with: "${specWhenAdded.fullName}"
  ${currentSpec ? `executed with: "${currentSpec.fullName}"` : 'executed outside of a spec'}
  attachment stack: ${stackWhenAdded}`)
    }
    listener(event)
  }
}
