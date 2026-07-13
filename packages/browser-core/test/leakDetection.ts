import { display } from '../src/tools/display'
import { getCurrentTest } from './getCurrentTest'
import { registerCleanupTask } from './registerCleanupTask'

export function startLeakDetection() {
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

function withLeakDetection(eventName: string, listener: EventListener) {
  const testWhenAdded = getCurrentTest()
  const stackWhenAdded = new Error().stack
  if (
    !testWhenAdded ||
    // Ignore listeners added by React: React is adding listeners to DOM elements for synthetic events, and there is no way to remove them
    stackWhenAdded?.includes('listenToAllSupportedEvents')
  ) {
    return listener
  }

  return (event: Event) => {
    const currentTest = getCurrentTest()
    if (testWhenAdded.id !== currentTest?.id) {
      display.error(`Leaked listener
  event names: "${eventName}"
  attached with: "${testWhenAdded.name}"
  ${currentTest ? `executed with: "${currentTest.name}"` : 'executed outside of a test'}
  attachment stack: ${stackWhenAdded}`)
    }
    listener(event)
  }
}
