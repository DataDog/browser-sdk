import { DOM_EVENT, addEventListener } from '../browser/addEventListener'
import type { Configuration } from '../domain/configuration'
import { getGlobalObject } from '../tools/getGlobalObject'
import { objectEntries } from '../tools/utils/polyfills'
import type { BrowserWindowWithEventBridge } from './eventBridge'

type IframeMessageHandlers = { [eventType: string]: (event: any) => void }

export function initIframeTracking(configuration: Configuration, handlers: IframeMessageHandlers) {
  createEventBridgeIfInsideAllowedParent(configuration)
  listenToAllowedChildMessages(configuration, handlers)
}

function createEventBridgeIfInsideAllowedParent(configuration: Configuration) {
  const global = getGlobalObject<BrowserWindowWithEventBridge>()
  if (
    !global.DatadogEventBridge &&
    global.parent !== global &&
    configuration.allowedIframeParentOrigins.includes(global.parent.location.origin)
  ) {
    global.DatadogEventBridge = {
      getAllowedWebViewHosts() {
        return JSON.stringify([global.location.hostname])
      },
      send(msg: string) {
        global.parent.postMessage(msg)
      },
    }
  }
}

interface MessageEventWithHandledFlag extends MessageEvent {
  // Flag to avoid multiple handlers to handle the same message
  handled?: true
}
function listenToAllowedChildMessages(configuration: Configuration, handlers: IframeMessageHandlers) {
  const global = getGlobalObject<BrowserWindowWithEventBridge>()
  addEventListener(configuration, global, DOM_EVENT.MESSAGE, (message: MessageEventWithHandledFlag) => {
    if (configuration.allowedIframeChildOrigins.includes(message.origin)) {
      const { eventType, event } = JSON.parse(message.data)
      for (const [handledEventType, handler] of objectEntries(handlers)) {
        if (!message.handled && eventType === handledEventType) {
          handler(event)
          message.handled = true
        }
      }
    }
  })
}
