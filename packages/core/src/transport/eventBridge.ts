import { includes, isExperimentalFeatureEnabled } from '..'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

export function getEventBridge<T, E>() {
  const eventBridgeGlobal = getEventBridgeGlobal()

  if (!eventBridgeGlobal) {
    return
  }

  return {
    getAllowedWebViewHosts() {
      return JSON.parse(eventBridgeGlobal.getAllowedWebViewHosts()) as string[]
    },
    send(eventType: T, event: E) {
      eventBridgeGlobal.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function canUseEventBridge(): boolean {
  const bridge = getEventBridge()

  return !!bridge && includes(bridge.getAllowedWebViewHosts(), window.location.hostname)
}

function getEventBridgeGlobal() {
  return isExperimentalFeatureEnabled('event-bridge') ? (window as BrowserWindow).DatadogEventBridge : null
}
