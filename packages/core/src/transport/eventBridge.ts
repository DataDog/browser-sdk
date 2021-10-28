import { isExperimentalFeatureEnabled } from '..'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export function isEventBridgePresent(): boolean {
  return !!getEventBridge()
}

function getEventBridge() {
  return isExperimentalFeatureEnabled('event-bridge') ? (window as BrowserWindow).DatadogEventBridge : null
}
