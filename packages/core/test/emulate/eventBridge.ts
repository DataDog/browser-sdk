import type { BrowserWindowWithEventBridge } from '../../src/transport'

export const PRIVACY_LEVEL_FROM_EVENT_BRIDGE = 'allow'
export function initEventBridgeStub(allowedWebViewHosts = [window.location.hostname]) {
  const eventBridgeStub = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getPrivacyLevel: () => PRIVACY_LEVEL_FROM_EVENT_BRIDGE,
  }
  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub
  return eventBridgeStub
}

export function deleteEventBridgeStub() {
  delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
}
