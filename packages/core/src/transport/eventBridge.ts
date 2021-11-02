import { Context, isExperimentalFeatureEnabled } from '..'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export type BridgeEventType = 'log' | 'view' | 'error' | 'action' | 'resource' | 'long_task'

export function getEventBridge() {
  const datadogEventBridge = getEventBridgeGlobal()

  return {
    send(eventType: BridgeEventType, event: Context) {
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
