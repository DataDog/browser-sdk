import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import { BridgeCapability } from '../../src/transport'
import type { BrowserWindowWithEventBridge, DatadogEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function mockEventBridge({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
  capabilities = [BridgeCapability.RECORDS],
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel; capabilities?: BridgeCapability[] } = {}) {
  const eventBridge: DatadogEventBridge = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getCapabilities: () => JSON.stringify(capabilities),
    getPrivacyLevel: () => privacyLevel,
  }

  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridge

  registerCleanupTask(() => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
  })
  return eventBridge
}
