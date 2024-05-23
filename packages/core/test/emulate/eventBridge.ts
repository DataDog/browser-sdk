import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import { BridgeCapability } from '../../src/transport'
import type { BrowserWindowWithEventBridge, DatadogEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function initEventBridgeStub({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
  capabilities = [BridgeCapability.RECORDS],
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel; capabilities?: BridgeCapability[] } = {}) {
  const eventBridgeStub: DatadogEventBridge = {
    getCapabilities: () => JSON.stringify(capabilities),
    getPrivacyLevel: () => privacyLevel,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    send: (_msg: string) => undefined,
  }

  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub

  registerCleanupTask(() => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
  })
  return eventBridgeStub
}
