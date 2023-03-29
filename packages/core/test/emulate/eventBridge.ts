import type { BrowserWindowWithEventBridge } from '../../src/transport'

export function initEventBridgeStub(allowedWebViewHosts: string[] = [window.location.hostname]) {
  const eventBridgeStub = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
  }
  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub
  return eventBridgeStub
}

export function deleteEventBridgeStub() {
  delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
}
