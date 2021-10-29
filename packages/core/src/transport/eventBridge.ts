import { Context, isExperimentalFeatureEnabled } from '..'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export type BridgeEventType = 'log' | 'view' | 'error' | 'action' | 'resource' | 'long_task'

export function getEventBridge() {
  const datadogEventBridge = getDatadogEventBridge()

  return {
    send(eventType: BridgeEventType, event: Context) {
      datadogEventBridge?.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function isEventBridgePresent(): boolean {
  return !!getDatadogEventBridge()
}

function getDatadogEventBridge() {
  return isExperimentalFeatureEnabled('event-bridge') ? (window as BrowserWindow).DatadogEventBridge : null
}
