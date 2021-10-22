import { Context } from '../tools/context'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export function getEventBridge() {
  const datadogEventBridge = getDatadogEventBridge()

  return {
    send(eventType: string, event: Context) {
      datadogEventBridge?.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function isEventBridgeDetected(): boolean {
  return !!getDatadogEventBridge()
}

function getDatadogEventBridge() {
  return (window as BrowserWindow).DatadogEventBridge
}
