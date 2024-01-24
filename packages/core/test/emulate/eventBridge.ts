import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import type { BrowserWindowWithEventBridge } from '../../src/transport'

export function initEventBridgeStub({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel } = {}) {
  const eventBridgeStub = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getPrivacyLevel: () => privacyLevel,
  }
  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub
  return eventBridgeStub
}

export function deleteEventBridgeStub() {
  delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
}
