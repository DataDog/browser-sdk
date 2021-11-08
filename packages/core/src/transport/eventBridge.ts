import { isExperimentalFeatureEnabled } from '..'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export function getEventBridge<T, E>() {
  const datadogEventBridge = getEventBridgeGlobal()

  return {
    send(eventType: T, event: E) {
      datadogEventBridge?.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function isEventBridgePresent(): boolean {
  return !!getEventBridgeGlobal()
}

function getEventBridgeGlobal() {
  return isExperimentalFeatureEnabled('event-bridge') ? (window as BrowserWindow).DatadogEventBridge : null
}
