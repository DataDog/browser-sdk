export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  send(msg: string): void
}

export function isEventBridgeDetected(): boolean {
  return !!getDatadogEventBridge()
}

function getDatadogEventBridge() {
  return (window as BrowserWindow).DatadogEventBridge
}
